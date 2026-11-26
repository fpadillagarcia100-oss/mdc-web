"""
mdc3d.py — Piezas comunes de las escenas 3D de MDC: materiales, geometría y luz.

Parte de MDC · Maquinaria de Chiapas.

Lo usan las escenas de esta carpeta (hero.py, maquinas.py). Nada de esto se
abre a mano en Blender: todo se construye desde código para que el render se
pueda repetir idéntico en cualquier máquina con `npm run render3d`. Un .blend
guardado en el repositorio serían 5 MB binarios que nadie puede revisar en un
diff; este archivo se lee.

Unidades: metros, Z arriba, la máquina mira hacia +X. Los perfiles 2D se
dibujan en el plano XZ (de lado) y se extruyen a lo ancho en Y: así se dibuja
de verdad una pluma o un cucharón, y es lo que hace que la silueta se vea
de máquina y no de juguete armado con cubos.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# ── Paleta de la marca ──
# Los mismos valores que styles.css. Se escriben en sRGB y se convierten aquí:
# Blender trabaja en lineal, y pasarle el hex tal cual daría un amarillo lavado.
AMARILLO = '#F5C400'
TINTA = '#121211'
GRAFITO = '#2B2B29'
VIOLETA = '#8B5CF6'
CIAN = '#22D3EE'
NARANJA = '#FF8A3D'


def lineal(hexa):
    """sRGB '#RRGGBB' → color lineal RGBA, que es lo que esperan los shaders."""
    hexa = hexa.lstrip('#')
    c = [int(hexa[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ══════════════════ MATERIALES ══════════════════

def _principled(nombre, color, metal=0.0, rugosidad=0.5, capa=0.0, capa_rug=0.05):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = lineal(color) if isinstance(color, str) else color
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rugosidad
    if capa:
        p.inputs['Coat Weight'].default_value = capa
        p.inputs['Coat Roughness'].default_value = capa_rug
    return m


def materiales():
    """Los materiales de toda máquina. Se crean una vez por escena."""
    return {
        # Pintura de fábrica: algo metálica y con barniz encima. El barniz es lo
        # que da el reflejo nítido sobre un color que por sí solo es mate; sin
        # él, el amarillo se ve de plástico.
        'pintura': _principled('Pintura', AMARILLO, metal=0.25, rugosidad=0.38, capa=0.8, capa_rug=0.06),
        'grafito': _principled('Grafito', GRAFITO, metal=0.55, rugosidad=0.42, capa=0.3, capa_rug=0.2),
        'tinta': _principled('Tinta', TINTA, metal=0.3, rugosidad=0.5),
        # Oruga y llantas: goma y acero sucio, casi sin brillo. Si brillaran
        # competirían con la pintura, que es lo que se vende.
        'goma': _principled('Goma', '#161615', metal=0.0, rugosidad=0.82),
        'cromo': _principled('Cromo', '#EDEDED', metal=1.0, rugosidad=0.12),
        'acero': _principled('Acero', '#7A7A76', metal=0.9, rugosidad=0.34),
        # Vidrio de cabina opaco y muy liso: un vidrio transparente obligaría a
        # amueblar el interior, y a este tamaño lo que se lee es el reflejo.
        'vidrio': _principled('Vidrio', '#0B0F14', metal=0.0, rugosidad=0.04, capa=1.0, capa_rug=0.02),
        'faro': _emisivo('Faro', '#FFF3D6', 6.0),
    }


def _emisivo(nombre, color, fuerza):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = lineal(color)
    em.inputs['Strength'].default_value = fuerza
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def material_anillo():
    """El borde vivo de la web (`--borde-vivo` en styles.css), hecho luz.

    Un degradado cónico amarillo → naranja → violeta → cian alrededor del eje
    Z del objeto: el mismo orden de colores que gira alrededor de la vitrina
    del hero en CSS. Así el video y el marco que lo rodea hablan el mismo
    idioma en vez de parecer dos cosas pegadas."""
    m = bpy.data.materials.new('Anillo')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'RADIAL'
    rampa = nt.nodes.new('ShaderNodeValToRGB')
    el = rampa.color_ramp.elements
    el[0].position, el[0].color = 0.0, lineal(AMARILLO)
    el[1].position, el[1].color = 1.0, lineal(AMARILLO)
    for pos, col in ((0.25, NARANJA), (0.5, VIOLETA), (0.75, CIAN)):
        e = el.new(pos)
        e.color = lineal(col)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 7.0
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(coord.outputs['Object'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Fac'], rampa.inputs['Fac'])
    nt.links.new(rampa.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


# ══════════════════ GEOMETRÍA ══════════════════

def _objeto(nombre, bm, material, padre=None, biselar=0.0, segmentos=3, angulo=35):
    me = bpy.data.meshes.new(nombre)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(ob)
    if material:
        ob.data.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = True
    if biselar:
        # El bisel es lo que separa un render de producto de un modelo de
        # bloques: los cantos vivos no atrapan luz y la pieza se ve plana.
        # Normales endurecidas para que las caras grandes sigan planas y sólo
        # el canto se redondee.
        b = ob.modifiers.new('Bisel', 'BEVEL')
        b.width = biselar
        b.segments = segmentos
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angulo)
        b.harden_normals = True
    else:
        # Sin bisel, las caras planas se sombrean planas: el ángulo decide qué
        # se suaviza (un cilindro) y qué no (la tapa del cilindro).
        try:
            ob.modifiers.new('Suave', 'NODES').node_group = _suavizado_por_angulo()
        except Exception:
            pass
    if padre:
        ob.parent = padre
    return ob


_SUAVE = {}


def _suavizado_por_angulo():
    """Nodo 'Smooth by Angle' a 30°, hecho a mano para no depender de la
    biblioteca de recursos de Blender, que en modo -b no siempre se carga."""
    if 'g' in _SUAVE:
        return _SUAVE['g']
    g = bpy.data.node_groups.new('SuavePorAngulo', 'GeometryNodeTree')
    g.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    g.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    ent = g.nodes.new('NodeGroupInput')
    sal = g.nodes.new('NodeGroupOutput')
    lisa = g.nodes.new('GeometryNodeSetShadeSmooth')
    lisa.domain = 'EDGE'
    ang = g.nodes.new('GeometryNodeInputMeshEdgeAngle')
    menor = g.nodes.new('FunctionNodeCompare')
    menor.data_type = 'FLOAT'
    menor.operation = 'LESS_THAN'
    menor.inputs['B'].default_value = math.radians(32)
    g.links.new(ang.outputs['Unsigned Angle'], menor.inputs['A'])
    g.links.new(ent.outputs[0], lisa.inputs['Geometry'])
    g.links.new(menor.outputs['Result'], lisa.inputs['Shade Smooth'])
    g.links.new(lisa.outputs[0], sal.inputs[0])
    _SUAVE['g'] = g
    return g


def caja(nombre, x0, x1, y0, y1, z0, z1, material, padre=None, biselar=0.03, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
    return _objeto(nombre, bm, material, padre, biselar, **kw)


def perfil(nombre, puntos, y0, y1, material, padre=None, biselar=0.03, **kw):
    """Extruye un contorno de lado (lista de (x, z)) a lo ancho, de y0 a y1."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in puntos]
    b = [bm.verts.new((x, y1, z)) for x, z in puntos]
    n = len(puntos)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    return _objeto(nombre, bm, material, padre, biselar, **kw)


def contorno(centro, grosor):
    """Contorno cerrado alrededor de una línea central con grosor variable.

    Así se dibujan la pluma y el brazo: se dice por dónde pasa el eje de la
    pieza y cuánto mide de ancho en cada punto, y esto devuelve el borde de
    arriba y el de abajo. Es como se ve una pluma real: gruesa en el codo,
    delgada en las puntas."""
    arriba, abajo = [], []
    n = len(centro)
    for i, (p, g) in enumerate(zip(centro, grosor)):
        a = Vector(centro[max(i - 1, 0)])
        b = Vector(centro[min(i + 1, n - 1)])
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x))
        q = Vector(p)
        arriba.append(tuple(q + nrm * g))
        abajo.append(tuple(q - nrm * g))
    return arriba + list(reversed(abajo))


def cilindro(nombre, radio, largo, material, padre=None, eje='Y', centro=(0, 0, 0),
             lados=32, biselar=0.0, desde_base=False, **kw):
    """Cilindro sobre un eje. `desde_base` lo hace crecer de 0 a `largo`
    en vez de quedar centrado: es lo que necesitan vástago y camisa de un
    pistón, que nacen en su perno y apuntan hacia el otro."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=lados, radius1=radio, radius2=radio, depth=largo)
    if desde_base:
        bmesh.ops.translate(bm, vec=(0, 0, largo / 2), verts=bm.verts)
    rot = {'X': Matrix.Rotation(math.radians(90), 4, 'Y'),
           'Y': Matrix.Rotation(math.radians(-90), 4, 'X'),
           'Z': Matrix.Identity(4)}[eje]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=centro, verts=bm.verts)
    return _objeto(nombre, bm, material, padre, biselar, **kw)


def unir(nombre, objetos):
    """Junta piezas que se mueven juntas en un solo objeto: menos llamadas de
    dibujo para EEVEE y una jerarquía que se lee."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objetos[0]
    bpy.ops.object.join()
    objetos[0].name = nombre
    return objetos[0]


def vacio(nombre, lugar, padre=None):
    e = bpy.data.objects.new(nombre, None)
    e.empty_display_size = 0.15
    bpy.context.scene.collection.objects.link(e)
    e.parent = padre
    e.location = lugar
    return e


def pivote(ob, padre, lugar):
    """Cuelga `ob` de `padre` con su origen en `lugar` (coordenadas del padre).

    La pieza se modela ya con su eje de giro en el origen, así que basta con
    ponerla en su sitio: rotarla después la hace girar sobre su perno, no
    sobre su centro. Equivocarse aquí es lo que hace que una pluma 'flote'."""
    ob.parent = padre
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = lugar
    return ob


# ══════════════════ PISTONES ══════════════════

def piston(nombre, ancla_a, ancla_b, radio, mats):
    """Un cilindro hidráulico entre dos pernos que se mueven por su cuenta.

    La camisa nace en A y mira siempre a B; el vástago nace en B y mira a A.
    Con eso el pistón se estira y se encoge solo cuando giran las piezas, sin
    animarlo a mano. Los largos se ajustan después en `medir_pistones`, cuando
    ya se sabe cuánto se separan los pernos en toda la animación."""
    camisa = cilindro(nombre + '.camisa', radio, 1.0, mats['grafito'], eje='Y', desde_base=True, lados=28)
    vastago = cilindro(nombre + '.vastago', radio * 0.55, 1.0, mats['cromo'], eje='Y', desde_base=True, lados=20)
    for parte, desde, hacia in ((camisa, ancla_a, ancla_b), (vastago, ancla_b, ancla_a)):
        parte.parent = desde
        parte.matrix_parent_inverse = Matrix.Identity(4)
        c = parte.constraints.new('DAMPED_TRACK')
        c.target = hacia
        c.track_axis = 'TRACK_Y'
    # Tapas: un aro más ancho en la punta de la camisa, como en las de verdad.
    return {'camisa': camisa, 'vastago': vastago, 'a': ancla_a, 'b': ancla_b}


def medir_pistones(pistones, cuadros):
    """Recorre la animación, mide la distancia entre pernos y da largo a cada
    camisa y vástago para que nunca se separen ni atraviesen el perno."""
    escena = bpy.context.scene
    dist = {id(p): [] for p in pistones}
    for f in cuadros:
        escena.frame_set(f)
        for p in pistones:
            d = (p['a'].matrix_world.translation - p['b'].matrix_world.translation).length
            dist[id(p)].append(d)
    for p in pistones:
        dmin, dmax = min(dist[id(p)]), max(dist[id(p)])
        camisa = dmin * 0.92
        vastago = min(dmin * 0.9, max(dmax - camisa + 0.18, dmin * 0.5))
        p['camisa'].scale = (1, camisa, 1)
        p['vastago'].scale = (1, vastago, 1)
        # escalar en Y estira también el bisel; con la camisa sin bisel no se nota
    escena.frame_set(cuadros[0])


# ══════════════════ ORUGA ══════════════════

def oruga(nombre, largo, radio, ancho, yc, zc, mats, padre=None):
    """Una oruga completa: banda, tejas, rueda motriz, rueda guía y rodillos.

    La banda sigue un estadio (dos medias lunas unidas por rectas). Las tejas
    se reparten sobre ese mismo camino, cada una girada según la curva: es lo
    que hace que la oruga se lea como oruga y no como una salchicha negra."""
    a = largo / 2 - radio
    piezas = []

    def camino(paso):
        per = 4 * a + 2 * math.pi * radio
        n = max(8, int(per / paso))
        pts = []
        for i in range(n):
            s = per * i / n
            if s < 2 * a:                                   # abajo, de atrás hacia delante
                p, t = Vector((-a + s, zc - radio)), Vector((1, 0))
            elif s < 2 * a + math.pi * radio:               # media luna delantera
                th = -math.pi / 2 + (s - 2 * a) / radio
                p = Vector((a + radio * math.cos(th), zc + radio * math.sin(th)))
                t = Vector((-math.sin(th), math.cos(th)))
            elif s < 4 * a + math.pi * radio:               # arriba, hacia atrás
                p, t = Vector((a - (s - 2 * a - math.pi * radio), zc + radio)), Vector((-1, 0))
            else:                                           # media luna trasera
                th = math.pi / 2 + (s - 4 * a - math.pi * radio) / radio
                p = Vector((-a + radio * math.cos(th), zc + radio * math.sin(th)))
                t = Vector((-math.sin(th), math.cos(th)))
            cx = max(-a, min(a, p.x))
            nrm = (p - Vector((cx, zc))).normalized()
            pts.append((p, t, nrm))
        return pts

    # Banda: una cinta cerrada con grosor.
    bm = bmesh.new()
    y0, y1 = yc - ancho / 2, yc + ancho / 2
    anillo = camino(0.06)
    va = [bm.verts.new((p.x, y0, p.y)) for p, _, _ in anillo]
    vb = [bm.verts.new((p.x, y1, p.y)) for p, _, _ in anillo]
    for i in range(len(anillo)):
        j = (i + 1) % len(anillo)
        bm.faces.new((va[i], va[j], vb[j], vb[i]))
    banda = _objeto(nombre + '.banda', bm, mats['goma'], padre)
    s = banda.modifiers.new('Grosor', 'SOLIDIFY')
    s.thickness = 0.07
    s.offset = 1.0
    piezas.append(banda)

    # Tejas: una cada 21 cm, como las zapatas de una oruga de 20 t.
    bm = bmesh.new()
    for p, t, nrm in camino(0.21):
        base = Vector((p.x, 0, p.y))
        t3 = Vector((t.x, 0, t.y))
        n3 = Vector((nrm.x, 0, nrm.y))
        for k0, k1, alto in ((-0.075, 0.075, 0.035), (-0.02, 0.02, 0.085)):
            vs = []
            for dt, dn in ((k0, 0.03), (k1, 0.03), (k1, alto + 0.03), (k0, alto + 0.03)):
                for y in (y0 - 0.015, y1 + 0.015):
                    q = base + t3 * dt + n3 * (dn + 0.035)
                    vs.append(bm.verts.new((q.x, y, q.z)))
            # 8 vértices: (0,1) cara 0, (2,3) cara 1, ... en pares de Y
            caras = ((0, 2, 4, 6), (1, 7, 5, 3), (0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 7, 6), (6, 7, 1, 0))
            for c in caras:
                bm.faces.new([vs[i] for i in c])
    tejas = _objeto(nombre + '.tejas', bm, mats['goma'], padre, biselar=0.008, segmentos=1)
    piezas.append(tejas)

    # Ruedas: motriz atrás (dentada), guía delante, rodillos abajo y arriba.
    ruedas = [
        cilindro(nombre + '.motriz', radio * 0.9, ancho * 0.7, mats['grafito'], centro=(-a, yc, zc), biselar=0.02),
        cilindro(nombre + '.guia', radio * 0.85, ancho * 0.7, mats['grafito'], centro=(a, yc, zc), biselar=0.02),
    ]
    for dy in (-1, 1):
        ruedas.append(cilindro(nombre + '.cubo', radio * 0.4, 0.06, mats['acero'],
                               centro=(-a, yc + dy * ancho * 0.36, zc), biselar=0.01))
        ruedas.append(cilindro(nombre + '.cubo', radio * 0.38, 0.06, mats['acero'],
                               centro=(a, yc + dy * ancho * 0.36, zc), biselar=0.01))
    n_rod = 6
    for i in range(n_rod):
        x = -a + 2 * a * (i + 0.5) / n_rod
        ruedas.append(cilindro(nombre + '.rodillo', 0.11, ancho * 0.62, mats['acero'],
                               centro=(x, yc, zc - radio + 0.12), biselar=0.01))
    for x in (-a * 0.35, a * 0.35):
        ruedas.append(cilindro(nombre + '.portador', 0.08, ancho * 0.4, mats['acero'],
                               centro=(x, yc, zc + radio - 0.09), biselar=0.01))
    ruedas = unir(nombre + '.ruedas', ruedas)
    ruedas.parent = padre
    piezas.append(ruedas)

    # Bastidor de la oruga: la viga que une las ruedas, en el color de la marca.
    bast = perfil(nombre + '.bastidor',
                  [(-a + 0.1, zc - 0.18), (a - 0.1, zc - 0.18), (a - 0.35, zc + 0.24), (-a + 0.35, zc + 0.24)],
                  yc - ancho * 0.33, yc + ancho * 0.33, mats['pintura'], padre, biselar=0.04)
    piezas.append(bast)
    return piezas


# ══════════════════ ESTUDIO ══════════════════

import os  # noqa: E402
VISTA = os.environ.get('MDC_VISTA', 'Standard')


def configurar_render(ancho, alto, muestras, cuadros=None, fps=24):
    e = bpy.context.scene
    e.render.engine = 'BLENDER_EEVEE'
    e.render.resolution_x, e.render.resolution_y = ancho, alto
    e.render.resolution_percentage = 100
    e.render.fps = fps
    if cuadros:
        e.frame_start, e.frame_end = cuadros
    ev = e.eevee
    ev.taa_render_samples = muestras
    # Reflejos y sombras de contacto con trazado en pantalla: el piso brillante
    # refleja la máquina y la máquina se asienta en él. Sin esto la excavadora
    # parece pegada encima de una foto.
    for attr, val in (('use_raytracing', True), ('use_shadows', True), ('shadow_ray_count', 2),
                      ('shadow_step_count', 8), ('use_fast_gi', True), ('fast_gi_distance', 2.0),
                      ('use_motion_blur', False)):
        if hasattr(ev, attr):
            setattr(ev, attr, val)
    if hasattr(ev, 'ray_tracing_options'):
        ev.ray_tracing_options.resolution_scale = '1'
    # Sin desenfoque de movimiento: con el piso que se desvanece (transparencia
    # tramada) dejaba un halo de ruido blanco alrededor de todo lo que se
    # movía. A 24 cuadros y con movimientos lentos no hace falta.
    e.render.use_motion_blur = False
    # 'Standard' y no AgX: se probaron los dos lado a lado y AgX convierte el
    # #F5C400 de la marca en un crema pálido —es su trabajo: desatura lo que
    # brilla—. Standard deja el amarillo idéntico al de los botones de la
    # web, que es lo que importa al ponerlos uno junto al otro. La luz
    # principal está medida para no quemar la pintura con él.
    e.view_settings.view_transform = VISTA
    if VISTA == 'AgX':
        e.view_settings.look = 'AgX - Punchy'
    e.view_settings.exposure = 0.0
    e.render.film_transparent = False
    e.render.image_settings.color_mode = 'RGB'
    e.world = e.world or bpy.data.worlds.new('Mundo')
    e.world.use_nodes = True
    bg = e.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = lineal('#0A0A09')
    bg.inputs['Strength'].default_value = 1.0


def luz_area(nombre, lugar, mira, color, potencia, tamano):
    d = bpy.data.lights.new(nombre, 'AREA')
    d.shape = 'DISK'
    d.size = tamano
    d.energy = potencia
    d.color = lineal(color)[:3]
    ob = bpy.data.objects.new(nombre, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = lugar
    direccion = Vector(mira) - Vector(lugar)
    ob.rotation_euler = direccion.to_track_quat('-Z', 'Y').to_euler()
    return ob


def iluminar(centro=(0.8, 0, 1.2), escala=1.0, contraluz=1.0):
    """Estudio de producto con el acento de la web.

    Principal cálida desde delante-izquierda arriba (la que define volumen),
    relleno neutro y bajo para que las sombras no se vayan a negro, y dos
    contraluces —violeta y cian, los de la aurora del hero— que dibujan el
    borde de la máquina contra el fondo oscuro. Sin contraluz, la silueta
    negra de la oruga se perdería en el fondo negro."""
    c = Vector(centro)
    k = escala
    luces = {}
    luces['principal'] = luz_area('Principal', c + Vector((5.5, 6.5, 7.5)) * k, c, '#FFE9C7', 4200 * k * k, 6 * k)
    luces['relleno'] = luz_area('Relleno', c + Vector((7.0, -5.0, 2.5)) * k, c, '#E8EEF5', 420 * k * k, 8 * k)
    # Contraluces altos: así su brillo en el piso cae detrás de la máquina y
    # no como dos manchas de colores delante de ella.
    luces['violeta'] = luz_area('Contra violeta', c + Vector((-6.0, 4.0, 7.5)) * k, c, VIOLETA, 4800 * k * k * contraluz, 4 * k)
    luces['cian'] = luz_area('Contra cian', c + Vector((-3.5, -6.0, 8.0)) * k, c, CIAN, 3800 * k * k * contraluz, 4 * k)
    luces['cenital'] = luz_area('Cenital', c + Vector((0, 0, 9)) * k, c, '#FFF6E5', 500 * k * k, 7 * k)
    return luces


def solo_sobre(luces, raiz):
    """Que estas luces alumbren la máquina y nada más.

    Los contraluces de color dejaban dos manchas violeta y cian en el piso
    brillante, delante de la máquina, más llamativas que la máquina misma.
    Con el enlace de luces siguen dibujando el borde de la pintura y el piso
    ni se entera."""
    col = bpy.data.collections.new('Maquina')
    for o in [raiz] + list(raiz.children_recursive):
        col.objects.link(o)
    for luz in luces:
        luz.light_linking.receiver_collection = col


def fondo_de_camara(camara, distancia=60.0):
    """Un telón pegado a la cámara con la aurora del hero pintada encima.

    Va pegado a la cámara —no a la escena— para que, cuando la cámara se
    balancea, el fondo se quede quieto en el cuadro igual que la aurora CSS
    se queda quieta detrás de la vitrina. Las manchas de luz son las mismas
    de `.hero-banner::before`: amarillo al centro, violeta abajo, cian arriba
    a la derecha, sobre la tinta de la marca."""
    d = camara.data
    # Con el sensor en AUTO y cuadro apaisado, el campo que manda es el
    # horizontal; angle_y supone un sensor de 24 mm que aquí no se usa.
    r = bpy.context.scene.render
    ancho = 2 * distancia * math.tan(d.angle_x / 2) * 1.25
    alto = ancho * r.resolution_y / r.resolution_x
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(ancho, alto, 1), verts=bm.verts)
    me = bpy.data.meshes.new('Telon')
    uv = bm.loops.layers.uv.new()
    for f in bm.faces:
        for lp in f.loops:
            lp[uv].uv = (lp.vert.co.x / ancho + 0.5, lp.vert.co.y / alto + 0.5)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Telon', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = camara
    ob.location = (0, 0, -distancia)
    # Que no proyecte sombra ni se refleje como un muro en la pintura.
    for attr in ('visible_shadow',):
        if hasattr(ob, attr):
            setattr(ob, attr, False)

    m = bpy.data.materials.new('Aurora')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    suma = None
    aspecto = ancho / alto
    # Más tenues que en CSS: allá la aurora se ve a través de un vidrio que
    # la apaga; aquí va directa, y una mancha fuerte se come la máquina.
    manchas = (
        ((0.62, 0.62), 0.50, AMARILLO, 0.10),
        ((0.08, 0.02), 0.60, VIOLETA, 0.30),
        ((1.00, 1.00), 0.45, CIAN, 0.18),
        ((0.98, 0.18), 0.32, NARANJA, 0.10),
    )
    base = nt.nodes.new('ShaderNodeRGB')
    base.outputs[0].default_value = lineal('#121211')
    suma = base.outputs[0]
    for (cx, cy), radio, color, fuerza in manchas:
        mapeo = nt.nodes.new('ShaderNodeMapping')
        mapeo.inputs['Location'].default_value = (-cx * aspecto, -cy, 0)
        mapeo.inputs['Scale'].default_value = (aspecto, 1, 1)
        # Mapping escala y después mueve: el centro va en unidades ya escaladas.
        nt.links.new(coord.outputs['UV'], mapeo.inputs['Vector'])
        largo = nt.nodes.new('ShaderNodeVectorMath')
        largo.operation = 'LENGTH'
        nt.links.new(mapeo.outputs[0], largo.inputs[0])
        rango = nt.nodes.new('ShaderNodeMapRange')
        rango.interpolation_type = 'SMOOTHSTEP'
        rango.inputs['From Min'].default_value = radio
        rango.inputs['From Max'].default_value = 0.0
        rango.inputs['To Min'].default_value = 0.0
        rango.inputs['To Max'].default_value = fuerza
        nt.links.new(largo.outputs['Value'], rango.inputs['Value'])
        mezcla = nt.nodes.new('ShaderNodeMix')
        mezcla.data_type = 'RGBA'
        mezcla.blend_type = 'SCREEN'
        mezcla.inputs['B'].default_value = lineal(color)
        nt.links.new(rango.outputs['Result'], mezcla.inputs['Factor'])
        nt.links.new(suma, mezcla.inputs['A'])
        suma = mezcla.outputs['Result']
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(suma, em.inputs['Color'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs[0])
    ob.data.materials.append(m)
    return ob


def piso(centro, radio_anillo, desvanecer=(6.0, 13.0)):
    """Piso de estudio brillante que se funde con el fondo, y el borde vivo.

    Primero hubo un pedestal: un disco con la máquina encima. Se veía de
    juguete en vitrina, y la pluma se salía del disco al estirarse y cavaba en
    el vacío. Un piso que se desvanece hacia el telón no tiene borde que
    delate el tamaño de la escena: la máquina parece estar en un estudio, no
    sobre un plato. El reflejo es lo que la asienta.

    El aro de luz queda dibujado EN el piso, alrededor de la máquina: el
    mismo degradado que gira alrededor de la vitrina en CSS."""
    cx, cy = centro
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    me = bpy.data.meshes.new('Piso')
    bm.to_mesh(me)
    bm.free()
    suelo = bpy.data.objects.new('Piso', me)
    bpy.context.scene.collection.objects.link(suelo)
    suelo.location = (cx, cy, 0)

    m = bpy.data.materials.new('Piso')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Metallic'].default_value = 0.4
    # Lejos del centro el piso se oscurece y se vuelve mate hasta perderse en
    # el telón. Primero se hizo con transparencia, pero EEVEE la resuelve
    # tramada —ruido fino en todo el fondo— y ese ruido es lo más caro que
    # se le puede dar a un códec de video: cada cuadro cambia por completo.
    coord = nt.nodes.new('ShaderNodeTexCoord')
    largo = nt.nodes.new('ShaderNodeVectorMath')
    largo.operation = 'LENGTH'
    rango = nt.nodes.new('ShaderNodeMapRange')
    rango.interpolation_type = 'SMOOTHSTEP'
    rango.inputs['From Min'].default_value, rango.inputs['From Max'].default_value = desvanecer
    color = nt.nodes.new('ShaderNodeMix')
    color.data_type = 'RGBA'
    color.inputs['A'].default_value = lineal('#0D0D0C')
    color.inputs['B'].default_value = lineal('#121211')
    rug = nt.nodes.new('ShaderNodeMapRange')
    rug.inputs['To Min'].default_value, rug.inputs['To Max'].default_value = 0.3, 1.0
    espec = nt.nodes.new('ShaderNodeMapRange')
    espec.inputs['To Min'].default_value, espec.inputs['To Max'].default_value = 0.5, 0.0
    nt.links.new(coord.outputs['Object'], largo.inputs[0])
    nt.links.new(largo.outputs['Value'], rango.inputs['Value'])
    nt.links.new(rango.outputs['Result'], color.inputs['Factor'])
    nt.links.new(rango.outputs['Result'], rug.inputs['Value'])
    nt.links.new(rango.outputs['Result'], espec.inputs['Value'])
    nt.links.new(color.outputs['Result'], p.inputs['Base Color'])
    nt.links.new(rug.outputs['Result'], p.inputs['Roughness'])
    nt.links.new(espec.outputs['Result'], p.inputs['Specular IOR Level'])
    transp = nt.nodes.new('ShaderNodeBsdfTransparent')
    mezcla = nt.nodes.new('ShaderNodeMixShader')
    out = nt.nodes.get('Material Output')
    nt.links.new(rango.outputs['Result'], mezcla.inputs['Fac'])
    nt.links.new(p.outputs[0], mezcla.inputs[1])
    nt.links.new(transp.outputs[0], mezcla.inputs[2])
    nt.links.new(mezcla.outputs[0], out.inputs['Surface'])
    suelo.data.materials.append(m)

    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=192, radius=radio_anillo)
    caras = bmesh.ops.extrude_edge_only(bm, edges=bm.edges)
    nuevos = [v for v in caras['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.scale(bm, vec=(1.012, 1.012, 1), verts=nuevos)
    anillo = _objeto('Anillo', bm, material_anillo())
    anillo.location = (cx, cy, 0.004)
    return suelo, anillo


def camara(nombre, lente=50):
    d = bpy.data.cameras.new(nombre)
    d.lens = lente
    d.clip_end = 200
    ob = bpy.data.objects.new(nombre, d)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def apuntar(ob, lugar, mira):
    ob.location = lugar
    ob.rotation_euler = (Vector(mira) - Vector(lugar)).to_track_quat('-Z', 'Y').to_euler()


def limpiar():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # El grupo de nodos guardado murió con la escena anterior.
    _SUAVE.clear()
