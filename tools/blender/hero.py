"""
hero.py — La excavadora animada del hero de la portada.

Parte de MDC · Maquinaria de Chiapas.

Se corre a través de tools/render-3d.js (`npm run render3d`), que es quien
encuentra Blender y decide dónde va cada archivo. A mano:

    blender -b --factory-startup -P tools/blender/hero.py -- --cuadros DIR [--prueba N]

Construye la excavadora pieza por pieza, la anima en un ciclo de excavación
que cierra sobre sí mismo y escribe un PNG por cuadro en DIR. Con --prueba N
renderiza sólo el cuadro N, rápido y con menos muestras, para mirar la pose
sin esperar veinte minutos.

── La jerarquía de pernos ──

  tren inferior (quieto)
    └─ casa         gira sobre la tornamesa (eje Z)
         └─ pluma   gira en su perno al pie de la casa (eje Y)
              └─ brazo     en la punta de la pluma
                   └─ cucharón  en la punta del brazo

Cada pieza se modela con su perno en el origen, así que rotarla la hace
girar donde gira la de verdad. Los pistones no se animan: cuelgan de un perno
en cada pieza y se miran entre sí, así que se estiran solos.
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mdc3d as m3  # noqa: E402

FPS = 24
CUADROS = 120          # 5 s: lo que tarda un ciclo de excavación tranquilo
ANCHO, ALTO = 800, 640  # la vitrina mide 400×320 en CSS; esto es su 2x


def argumentos():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    op = {'cuadros': None, 'prueba': None, 'muestras': None}
    for i, x in enumerate(a):
        if x == '--cuadros':
            op['cuadros'] = a[i + 1]
        elif x == '--prueba':
            op['prueba'] = [int(n) for n in a[i + 1].split(',')]
        elif x == '--muestras':
            op['muestras'] = int(a[i + 1])
    return op


# ══════════════════ LA MÁQUINA ══════════════════

def excavadora(mats):
    raiz = m3.vacio('Excavadora', (0, 0, 0))

    # ── Tren inferior ──
    for lado in (-1, 1):
        m3.oruga('Oruga' + ('I' if lado > 0 else 'D'), 4.3, 0.42, 0.62, lado * 1.17, 0.54, mats, raiz)
    m3.caja('Chasis', -0.95, 0.95, -0.9, 0.9, 0.55, 0.98, mats['grafito'], raiz, biselar=0.06)
    m3.cilindro('Tornamesa', 0.95, 0.14, mats['tinta'], raiz, eje='Z', centro=(0, 0, 1.04), lados=64, biselar=0.02)

    # ── Casa ── (origen sobre la tornamesa)
    casa = m3.vacio('Casa', (0, 0, 1.11), raiz)
    P, G = mats['pintura'], mats['grafito']
    m3.caja('Plataforma', -1.75, 1.4, -1.3, 1.3, 0.0, 0.2, G, casa, biselar=0.04)
    # Cofre del motor con el techo apenas inclinado hacia atrás.
    m3.perfil('Cofre', [(-1.55, 0.2), (0.25, 0.2), (0.25, 1.05), (-1.55, 0.98)], -1.3, 1.3, P, casa, biselar=0.07)
    m3.perfil('Tapa', [(-1.35, 0.98), (-0.05, 1.03), (-0.1, 1.11), (-1.3, 1.06)], -1.05, 0.12, G, casa, biselar=0.025)
    # Rejillas laterales: cuatro listones oscuros que dicen "aquí hay un motor".
    for i in range(5):
        x = -1.2 + i * 0.17
        m3.caja('Rejilla', x, x + 0.08, 1.295, 1.315, 0.42, 0.82, mats['tinta'], casa, biselar=0.01)
    # Contrapeso: el bloque trasero, redondeado en planta como los reales.
    m3.caja('Contrapeso', -2.12, -1.45, -1.3, 1.3, 0.04, 1.02, G, casa, biselar=0.32, segmentos=6, angulo=60)
    m3.caja('Franja', -2.13, -1.9, -1.0, 1.0, 0.62, 0.7, P, casa, biselar=0.02)
    m3.cilindro('Escape', 0.07, 0.55, mats['cromo'], casa, eje='Z', centro=(-0.75, -0.75, 1.3), lados=20)
    # Barandal: tubo fino sobre el cofre, del lado derecho.
    for x in (-1.2, -0.2):
        m3.cilindro('Poste', 0.025, 0.35, P, casa, eje='Z', centro=(x, -1.2, 1.22), lados=12)
    m3.cilindro('Pasamanos', 0.028, 1.14, P, casa, eje='X', centro=(-0.7, -1.2, 1.4), lados=12)

    # Cabina: cuerpo oscuro, techo en el color de la marca y vidrio enrasado.
    cab = [(0.25, 0.2), (1.38, 0.2), (1.38, 1.28), (1.16, 2.02), (0.25, 2.02)]
    m3.perfil('Cabina', cab, 0.18, 1.26, G, casa, biselar=0.05)
    m3.perfil('Techo', [(0.18, 2.0), (1.22, 2.0), (1.2, 2.12), (0.2, 2.12)], 0.12, 1.3, P, casa, biselar=0.035)
    # Vidrio lateral (dos hojas) y frontal (dos tramos, recto y en pecho).
    m3.perfil('VidrioLado', [(0.35, 0.95), (0.86, 0.95), (0.86, 1.92), (0.35, 1.92)], 1.255, 1.272, mats['vidrio'], casa, biselar=0.008)
    m3.perfil('VidrioLado2', [(0.94, 0.62), (1.28, 0.62), (1.28, 1.27), (1.1, 1.9), (0.94, 1.9)],
              1.255, 1.272, mats['vidrio'], casa, biselar=0.008)
    m3.perfil('VidrioFrente', [(1.378, 0.7), (1.392, 0.7), (1.392, 1.27), (1.17, 2.0), (1.155, 1.99), (1.378, 1.27)],
              0.27, 1.17, mats['vidrio'], casa, biselar=0.004)
    # Faros de trabajo bajo el techo: dos puntos de luz que dan escala.
    for y in (0.3, 1.1):
        m3.cilindro('Faro', 0.05, 0.05, mats['faro'], casa, eje='X', centro=(1.24, y, 2.06), lados=16)

    # ── Pluma ── (origen en su perno, al frente de la casa)
    yp, ap = -0.32, 0.46                     # al lado derecho de la cabina
    m3.caja('Pie', 0.9, 1.45, yp - 0.36, yp + 0.36, 0.15, 0.85, G, casa, biselar=0.05)
    pluma = m3.vacio('Pluma', (1.2, yp, 0.72), casa)
    centro_p = [(0, 0), (1.25, 0.98), (2.5, 1.5), (3.6, 1.28), (4.75, 0.55)]
    m3.perfil('PlumaCuerpo', m3.contorno(centro_p, [0.22, 0.34, 0.38, 0.29, 0.19]),
              -ap / 2, ap / 2, P, pluma, biselar=0.05)
    m3.cilindro('PernoPluma', 0.13, ap + 0.12, mats['acero'], pluma, biselar=0.015)
    m3.cilindro('PernoPunta', 0.12, ap + 0.1, mats['acero'], pluma, centro=(4.75, 0, 0.55), biselar=0.015)
    # Orejas donde se apoyan los pistones: sin ellas el pistón saldría del aire.
    m3.caja('OrejaPanza', 1.32, 1.62, -ap / 2 - 0.12, ap / 2 + 0.12, 0.52, 0.72, G, pluma, biselar=0.03)
    m3.caja('OrejaLomo', 2.15, 2.5, -0.16, 0.16, 1.75, 2.02, G, pluma, biselar=0.03)

    # La marca en el costado de la pluma, que es lo que más se ve de lado.
    rotular('MDC', pluma, centro_p[1], centro_p[2], ap / 2 + 0.003, 0.42, mats['tinta'])

    # ── Brazo ──
    brazo = m3.vacio('Brazo', (4.75, 0, 0.55), pluma)
    centro_b = [(-0.42, 0.58), (0, 0), (0.22, -1.4), (0.34, -2.82)]
    m3.perfil('BrazoCuerpo', m3.contorno(centro_b, [0.15, 0.25, 0.2, 0.13]), -0.17, 0.17, P, brazo, biselar=0.04)
    m3.cilindro('PernoCucharon', 0.09, 0.62, mats['acero'], brazo, centro=(0.34, 0, -2.82), biselar=0.01)
    m3.caja('OrejaBrazo', 0.18, 0.45, -0.12, 0.12, -0.48, -0.22, G, brazo, biselar=0.025)

    # ── Cucharón ── (origen en el perno)
    # La boca mira hacia la máquina, como en toda retro de excavación: el
    # cucharón raspa hacia atrás, no empuja hacia delante. El primer intento
    # lo tenía al revés y parecía pala frontal; el contorno se sigue
    # escribiendo "de frente" porque así se lee, y `espejo` lo voltea.
    espejo = lambda pts: [(-x, z) for x, z in pts]  # noqa: E731
    cuch = m3.vacio('Cucharon', (0.34, 0, -2.82), brazo)
    concha = espejo([(0.52, 0.18), (-0.12, 0.16), (-0.3, -0.22), (-0.24, -0.66), (0.08, -0.98),
                     (0.52, -1.1), (0.92, -1.02)])
    ancho_c = 0.98
    lado_c = concha + espejo([(0.62, -0.3)])
    for s in (-1, 1):
        y = s * ancho_c / 2
        m3.perfil('Costado', lado_c, y - 0.035, y + 0.035, mats['grafito'], cuch, biselar=0.015)
    # La concha: la curva del fondo extruida a lo ancho, con grosor.
    bm = bmesh.new()
    a = [bm.verts.new((x, -ancho_c / 2, z)) for x, z in concha]
    b = [bm.verts.new((x, ancho_c / 2, z)) for x, z in concha]
    for i in range(len(concha) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    fondo = m3._objeto('Concha', bm, mats['grafito'], cuch)
    s = fondo.modifiers.new('Grosor', 'SOLIDIFY')
    s.thickness = 0.06
    fondo.modifiers.new('Sub', 'SUBSURF').levels = 2
    # Cuchilla y dientes de acero en el labio.
    m3.caja('Cuchilla', -1.0, -0.84, -ancho_c / 2, ancho_c / 2, -1.06, -0.98, mats['acero'], cuch, biselar=0.01)
    for i in range(5):
        y = -ancho_c / 2 + 0.1 + i * (ancho_c - 0.2) / 4
        m3.perfil('Diente', espejo([(0.9, -0.97), (1.18, -0.94), (1.22, -0.98), (0.9, -1.08)]),
                  y - 0.05, y + 0.05, mats['acero'], cuch, biselar=0.012)
    m3.caja('OrejaCuch', 0.12, 0.4, -0.13, 0.13, 0.06, 0.3, G, cuch, biselar=0.02)

    # ── Pistones ── (perno en cada pieza; se estiran solos)
    pistones = []
    for dy in (-ap / 2 - 0.12, ap / 2 + 0.12):
        pistones.append(m3.piston('PistonPluma',
                                  m3.vacio('pA', (1.5, yp + dy, 0.3), casa),
                                  m3.vacio('pB', (1.47, dy, 0.6), pluma), 0.11, mats))
    pistones.append(m3.piston('PistonBrazo',
                              m3.vacio('bA', (2.32, 0, 1.95), pluma),
                              m3.vacio('bB', (-0.38, 0, 0.52), brazo), 0.12, mats))
    pistones.append(m3.piston('PistonCucharon',
                              m3.vacio('cA', (0.32, 0, -0.35), brazo),
                              m3.vacio('cB', (0.3, 0, 0.2), cuch), 0.095, mats))
    return {'raiz': raiz, 'casa': casa, 'pluma': pluma, 'brazo': brazo, 'cucharon': cuch, 'pistones': pistones}


def rotular(texto, padre, p1, p2, y, alto, material):
    """Letras en relieve sobre el costado +Y de una pieza, siguiendo el tramo
    p1→p2 de su perfil. La cámara mira desde +Y, donde el frente de la
    máquina queda a la izquierda: para que se lea de izquierda a derecha,
    el texto corre hacia atrás (de p2 a p1)."""
    from mathutils import Matrix, Vector
    cu = bpy.data.curves.new(texto, 'FONT')
    cu.body = texto
    cu.size = alto
    cu.extrude = 0.008
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    try:
        cu.font = bpy.data.fonts.load('C:/Windows/Fonts/arialbd.ttf')
    except Exception:
        pass   # sin Arial se queda la tipografía de Blender: se lee igual
    ob = bpy.data.objects.new(texto, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    eje_x = Vector((p1[0] - p2[0], 0, p1[1] - p2[1])).normalized()
    eje_z = Vector((0, 1, 0))
    eje_y = eje_z.cross(eje_x)
    m = Matrix((eje_x, eje_y, eje_z)).transposed().to_4x4()
    m.translation = ((p1[0] + p2[0]) / 2, y, (p1[1] + p2[1]) / 2)
    ob.parent = padre
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = m
    return ob


# ══════════════════ LA ANIMACIÓN ══════════════════

# Poses del ciclo en el plano de la máquina, en radianes, girando "hacia
# arriba" (contra reloj visto con la máquina mirando a la derecha). Las
# alturas salieron de resolver la cadena pluma-brazo-cucharón para que los
# dientes rocen el piso sin atravesarlo; `revisar_piso` lo comprueba. Cada
# renglón es un momento del ciclo: estirarse, clavar, arrastrar, levantar y
# girar, vaciar. El último se une con el primero, así que el video no tiene
# corte: al terminar, la máquina está exactamente donde empezó.
POSES = [
    #  t     giro   pluma   brazo  cucharón (+ abre, − recoge)
    (0.00,  0.00,   0.34,   0.50,   0.70),   # estirada, boca abierta
    (0.17,  0.00,   0.29,   0.45,   0.60),   # clava los dientes
    (0.29,  0.00,   0.38,   0.00,   0.00),   # arrastra hacia la máquina
    (0.40,  0.00,   0.34,  -0.35,  -0.70),   # recoge
    (0.58, -0.40,   0.46,  -0.25,  -1.30),   # levanta y gira
    (0.78, -0.45,   0.42,   0.30,   0.90),   # vacía
]


def pose(t):
    """Interpolación Hermite cíclica: pasa por cada pose sin frenar en seco y
    la velocidad del último tramo empalma con la del primero."""
    n = len(POSES)
    ts = [p[0] for p in POSES]
    i = max(k for k in range(n) if ts[k] <= t)
    t0, t1 = ts[i], ts[(i + 1) % n] + (1.0 if i + 1 == n else 0.0)
    tp, tn = ts[i - 1] - (1.0 if i == 0 else 0.0), ts[(i + 2) % n] + (1.0 if i + 2 >= n else 0.0)
    p0, p1 = POSES[i][1:], POSES[(i + 1) % n][1:]
    pp, pn = POSES[i - 1][1:], POSES[(i + 2) % n][1:]
    h = t1 - t0
    u = (t - t0) / h
    m0 = [(b - a) / (t1 - tp) * h for a, b in zip(pp, p1)]
    m1 = [(b - a) / (tn - t0) * h for a, b in zip(p0, pn)]
    h00, h10 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u
    h01, h11 = -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    return [h00 * a + h10 * ma + h01 * b + h11 * mb for a, b, ma, mb in zip(p0, p1, m0, m1)]


def animar(maq, cam, mira, anillo):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
    for f in range(1, CUADROS + 1):
        t = (f - 1) / CUADROS
        giro, pl, br, cu = pose(t)
        maq['casa'].rotation_euler = (0, 0, giro)
        # Girar "hacia arriba" en el plano XZ es girar en negativo sobre Y.
        maq['pluma'].rotation_euler = (0, -pl, 0)
        maq['brazo'].rotation_euler = (0, -br, 0)
        maq['cucharon'].rotation_euler = (0, -cu, 0)
        for k in ('casa', 'pluma', 'brazo', 'cucharon'):
            maq[k].keyframe_insert('rotation_euler', frame=f)
        # Cámara: un vaivén lento de ±7° alrededor de la máquina. Un giro
        # completo en 5 s marearía; esto basta para que el volumen se lea.
        az = math.radians(36 + 6 * math.sin(2 * math.pi * t))
        el = math.radians(15 + 1.5 * math.sin(2 * math.pi * t + 1.2))
        r = 21.0
        m3.apuntar(cam, (mira[0] + r * math.cos(az) * math.cos(el), mira[1] + r * math.sin(az) * math.cos(el),
                         mira[2] + r * math.sin(el)), mira)
        cam.keyframe_insert('location', frame=f)
        cam.keyframe_insert('rotation_euler', frame=f)
        # El borde vivo da una vuelta entera por ciclo, como el de CSS.
        anillo.rotation_euler = (0, 0, -2 * math.pi * t)
        anillo.keyframe_insert('rotation_euler', frame=f)


def revisar_piso(cucharon):
    """Avisa si en algún cuadro el cucharón atraviesa el piso. Con poses
    escritas a mano es fácil bajar la pluma dos grados de más y que los
    dientes se hundan en el reflejo: se ve mal y no lo nota nadie hasta
    mirar el video entero."""
    from mathutils import Vector
    e = bpy.context.scene
    piezas = [o for o in cucharon.children_recursive if o.type == 'MESH']
    peor = (9, 0)
    for f in range(1, CUADROS + 1):
        e.frame_set(f)
        z = min((o.matrix_world @ Vector(c)).z for o in piezas for c in o.bound_box)
        peor = min(peor, (z, f))
    print(f'MDC cucharón: altura mínima {peor[0]:.2f} m en el cuadro {peor[1]}')
    if peor[0] < 0.0:
        print('MDC AVISO: el cucharón atraviesa el piso')
    e.frame_set(1)


def main():
    op = argumentos()
    m3.limpiar()
    prueba = op['prueba'] is not None
    m3.configurar_render(ANCHO, ALTO, op['muestras'] or (16 if prueba else 64), (1, CUADROS), FPS)
    mats = m3.materiales()
    maq = excavadora(mats)
    _, anillo = m3.piso((0.0, 0.0), 3.1)
    luces = m3.iluminar(centro=(1.2, 0, 1.4))
    m3.solo_sobre([luces['violeta'], luces['cian']], maq['raiz'])
    cam = m3.camara('Camara', lente=60)
    mira = (2.7, 0.0, 1.7)
    animar(maq, cam, mira, anillo)
    m3.fondo_de_camara(cam)
    m3.medir_pistones(maq['pistones'], range(1, CUADROS + 1))
    revisar_piso(maq['cucharon'])

    salida = os.path.abspath(op['cuadros'] or os.path.join(os.getcwd(), 'tmp-render'))
    os.makedirs(salida, exist_ok=True)
    e = bpy.context.scene
    e.render.image_settings.file_format = 'PNG'
    if prueba:
        for f in op['prueba']:
            e.frame_set(f)
            e.render.filepath = os.path.join(salida, f'prueba-{f:03d}.png')
            bpy.ops.render.render(write_still=True)
    else:
        e.render.filepath = os.path.join(salida, 'c')
        bpy.ops.render.render(animation=True)


# Sólo cuando se corre directo: maquinas.py importa este archivo para reusar
# la excavadora en su foto fija, y no debe disparar el render del video.
if __name__ == '__main__':
    main()
