"""
maquinas.py — Una foto de estudio por tipo de máquina, para las fichas sin foto.

Parte de MDC · Maquinaria de Chiapas.

    blender -b --factory-startup -P tools/blender/maquinas.py -- --salida assets/3d/maquinas [--solo grua]

Mientras un equipo no tiene fotografía, la tarjeta del catálogo enseñaba un
dibujo plano de 2015 (icons.js). Esto renderiza los seis tipos que usa el
catálogo —excavadora, retro, bulldozer, compactador, minicargador, grúa—
con la misma pintura y la misma luz que el hero, sobre fondo transparente
para que se asienten en el gris cálido de la tarjeta.

Se usa Cycles y no EEVEE, a diferencia del video: son seis imágenes, no 120
cuadros, y Cycles tiene "atrapasombras" — un piso invisible que sólo guarda
la sombra. Sin sombra, una máquina sobre fondo transparente flota.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mdc3d as m3  # noqa: E402

ANCHO, ALTO = 600, 400  # la tarjeta mide ~360×210: 3:2 y con margen para pantallas 2x


def argumentos():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    op = {'salida': None, 'solo': None, 'muestras': 96}
    for i, x in enumerate(a):
        if x == '--salida':
            op['salida'] = a[i + 1]
        elif x == '--solo':
            op['solo'] = a[i + 1].split(',')
        elif x == '--muestras':
            op['muestras'] = int(a[i + 1])
    return op


# ══════════════════ PIEZAS COMUNES ══════════════════

def rueda(nombre, radio, ancho, centro, mats, padre, taco=True):
    """Llanta con rin y tacos. Los tacos son lo que la distingue de un disco."""
    x, y, z = centro
    piezas = [m3.cilindro(nombre, radio, ancho, mats['goma'], centro=centro, lados=48,
                          biselar=ancho * 0.28, segmentos=4, angulo=30)]
    lado = 1 if y >= 0 else -1
    piezas.append(m3.cilindro(nombre + '.rin', radio * 0.6, ancho * 0.9, mats['pintura'],
                              centro=(x, y + lado * 0.02, z), lados=40, biselar=0.025))
    piezas.append(m3.cilindro(nombre + '.cubo', radio * 0.24, ancho * 0.96, mats['acero'],
                              centro=(x, y + lado * 0.04, z), lados=24, biselar=0.015))
    if taco:
        n = max(16, int(2 * math.pi * radio / 0.17))
        for i in range(n):
            a = 2 * math.pi * i / n
            for k in (-1, 1):
                # Tacos en espiga: alternados a cada lado del centro, como en
                # las llantas de obra. Es el detalle que se lee de lejos.
                ang = a + k * 0.04
                cx, cz = x + math.cos(ang) * (radio + 0.015), z + math.sin(ang) * (radio + 0.015)
                t = m3.caja(nombre + '.taco', -0.05, 0.05, -ancho * 0.22, ancho * 0.22, -0.035, 0.035,
                            mats['goma'], biselar=0.012, segmentos=1)
                t.location = (cx, y + k * ancho * 0.2, cz)
                t.rotation_euler = (0, -ang + math.pi / 2, k * 0.35)
                piezas.append(t)
    # Piezas sueltas y no unidas: al unir, el bisel grande de la llanta se
    # aplicaría también a cada taco y los borraría.
    for p in piezas:
        p.parent = padre
    return piezas[0]


def tubo(nombre, a, b, radio, material, padre=None):
    """Cilindro fijo entre dos puntos: pistones y largueros de una foto quieta."""
    a, b = Vector(a), Vector(b)
    ob = m3.cilindro(nombre, radio, (b - a).length, material, eje='Z', lados=20)
    ob.location = (a + b) / 2
    ob.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    ob.parent = padre
    return ob


def piston_fijo(nombre, a, b, radio, mats, padre=None):
    a, b = Vector(a), Vector(b)
    medio = a + (b - a) * 0.58
    tubo(nombre + '.camisa', a, medio, radio, mats['grafito'], padre)
    tubo(nombre + '.vastago', medio - (b - a) * 0.05, b, radio * 0.55, mats['cromo'], padre)


def cabina(prefijo, x0, x1, y0, y1, z0, z1, mats, padre, pecho=0.0):
    """Cabina de vidrio con techo amarillo, como la de la excavadora.

    `pecho` inclina el vidrio de enfrente hacia atrás en la parte alta."""
    G, P, V = mats['grafito'], mats['pintura'], mats['vidrio']
    perfil = [(x0, z0), (x1, z0), (x1, z1 - (z1 - z0) * 0.45), (x1 - pecho, z1), (x0, z1)]
    m3.perfil(prefijo + 'Cabina', perfil, y0, y1, G, padre, biselar=0.05)
    m3.perfil(prefijo + 'Techo', [(x0 - 0.08, z1 - 0.02), (x1 - pecho + 0.1, z1 - 0.02),
                                  (x1 - pecho + 0.08, z1 + 0.11), (x0 - 0.06, z1 + 0.11)],
              y0 - 0.06, y1 + 0.06, P, padre, biselar=0.035)
    h = z1 - z0
    m3.perfil(prefijo + 'VidrioLado', [(x0 + 0.1, z0 + h * 0.38), (x1 - 0.1, z0 + h * 0.38),
                                       (x1 - 0.1, z1 - h * 0.45), (x1 - pecho - 0.08, z1 - 0.09),
                                       (x0 + 0.1, z1 - 0.09)],
              y1 - 0.004, y1 + 0.014, V, padre, biselar=0.006)
    m3.perfil(prefijo + 'VidrioFrente', [(x1 - 0.004, z0 + h * 0.3), (x1 + 0.014, z0 + h * 0.3),
                                         (x1 + 0.014, z1 - h * 0.45), (x1 - pecho + 0.012, z1 - 0.08),
                                         (x1 - pecho - 0.006, z1 - 0.08), (x1 - 0.004, z1 - h * 0.45)],
              y0 + 0.09, y1 - 0.09, V, padre, biselar=0.004)


def concha(nombre, puntos, ancho, mats, padre, grosor=0.06):
    """Hoja curva extruida a lo ancho (cucharón, cuchilla), con sus costados."""
    import bmesh
    bm = bmesh.new()
    a = [bm.verts.new((x, -ancho / 2, z)) for x, z in puntos]
    b = [bm.verts.new((x, ancho / 2, z)) for x, z in puntos]
    for i in range(len(puntos) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    hoja = m3._objeto(nombre, bm, mats['pintura'], padre)
    s = hoja.modifiers.new('Grosor', 'SOLIDIFY')
    s.thickness = grosor
    hoja.modifiers.new('Sub', 'SUBSURF').levels = 2
    for lado in (-1, 1):
        y = lado * ancho / 2
        m3.perfil(nombre + '.costado', puntos, y - 0.03, y + 0.03, mats['pintura'], padre, biselar=0.012)
    return hoja


# ══════════════════ LAS MÁQUINAS ══════════════════

def rotular(*args):
    from hero import rotular as r
    return r(*args)


def excavadora(mats):
    import hero
    maq = hero.excavadora(mats)
    # Pose de foto: brazo recogido y el cucharón apoyado frente a la máquina.
    # Así cabe en una tarjeta apaisada, y nada cuelga en el aire.
    maq['pluma'].rotation_euler = (0, -0.15, 0)
    maq['brazo'].rotation_euler = (0, 0.6, 0)
    maq['cucharon'].rotation_euler = (0, 1.0, 0)
    m3.medir_pistones(maq['pistones'], [bpy.context.scene.frame_current])
    return maq['raiz']


def retro(mats):
    raiz = m3.vacio('Retro', (0, 0, 0))
    P, G = mats['pintura'], mats['grafito']
    for x, r, w in ((-1.05, 0.8, 0.56), (1.5, 0.54, 0.42)):
        for s in (-1, 1):
            rueda('Rueda', r, w, (x, s * 0.95, r), mats, raiz)
    m3.caja('Chasis', -2.1, 2.2, -0.5, 0.5, 0.45, 0.95, G, raiz, biselar=0.04)
    m3.perfil('Cofre', [(0.25, 0.9), (2.3, 0.9), (2.3, 1.42), (2.08, 1.62), (0.25, 1.74)], -0.56, 0.56, P, raiz, biselar=0.09)
    m3.caja('Parrilla', 2.29, 2.33, -0.42, 0.42, 1.0, 1.4, mats['tinta'], raiz, biselar=0.01)
    for s in (-1, 1):
        m3.cilindro('Faro', 0.07, 0.05, mats['faro'], raiz, eje='X', centro=(2.32, s * 0.3, 1.5), lados=16)
        m3.caja('Salpicadera', -1.85, -0.25, s * 0.62 - 0.33, s * 0.62 + 0.33, 1.62, 1.7, P, raiz, biselar=0.03)
    m3.caja('Cuerpo', -1.65, 0.3, -0.86, 0.86, 0.95, 1.62, P, raiz, biselar=0.06)
    cabina('', -1.6, 0.28, -0.84, 0.84, 1.6, 2.85, mats, raiz, pecho=0.1)
    m3.cilindro('Escape', 0.06, 0.6, mats['cromo'], raiz, eje='Z', centro=(1.3, -0.35, 1.95), lados=16)
    rotular('MDC', raiz, (0.55, 1.28), (2.0, 1.28), 0.565, 0.3, mats['tinta'])
    # Cargador frontal: brazos por fuera del cofre hasta el cucharón ancho.
    for s in (-1, 1):
        m3.perfil('BrazoCargador', m3.contorno([(0.05, 1.95), (1.4, 1.62), (2.65, 0.95), (2.92, 0.72)],
                                               [0.13, 0.15, 0.13, 0.11]), s * 0.74 - 0.07, s * 0.74 + 0.07, P, raiz, biselar=0.03)
        piston_fijo('PistonCargador', (0.6, s * 0.62, 1.1), (1.9, s * 0.62, 1.42), 0.075, mats, raiz)
    concha('CucharonFrente', [(3.05, 1.32), (2.8, 1.22), (2.66, 0.86), (2.71, 0.46), (2.92, 0.3), (3.6, 0.26)],
           2.3, mats, raiz)
    m3.caja('Cuchilla', 3.45, 3.68, -1.15, 1.15, 0.23, 0.29, mats['acero'], raiz, biselar=0.01)
    # Retroexcavadora atrás, plegada para transporte.
    m3.caja('Torre', -2.45, -2.0, -0.42, 0.42, 0.8, 1.6, G, raiz, biselar=0.04)
    m3.perfil('Pluma', m3.contorno([(-2.25, 1.35), (-2.55, 2.55), (-2.85, 3.25), (-3.25, 3.25)],
                                   [0.17, 0.21, 0.17, 0.13]), -0.17, 0.17, P, raiz, biselar=0.04)
    m3.perfil('Brazo', m3.contorno([(-3.3, 3.4), (-3.35, 2.2), (-3.25, 1.15)], [0.12, 0.13, 0.1]),
              -0.13, 0.13, P, raiz, biselar=0.03)
    m3.perfil('Cucharon', [(-3.3, 1.25), (-2.85, 1.2), (-2.7, 0.85), (-2.9, 0.55), (-3.3, 0.62)],
              -0.33, 0.33, G, raiz, biselar=0.03)
    piston_fijo('PistonPluma', (-2.2, 0.0, 1.5), (-2.7, 0.0, 2.75), 0.08, mats, raiz)
    for s in (-1, 1):
        tubo('Estabilizador', (-2.15, s * 0.6, 1.4), (-2.3, s * 1.15, 0.45), 0.08, G, raiz)
        m3.caja('Zapata', -2.5, -2.1, s * 1.15 - 0.2, s * 1.15 + 0.2, 0.35, 0.45, G, raiz, biselar=0.02)
    return raiz


def bulldozer(mats):
    raiz = m3.vacio('Bulldozer', (0, 0, 0))
    P, G = mats['pintura'], mats['grafito']
    for s in (-1, 1):
        m3.oruga('Oruga', 3.9, 0.44, 0.62, s * 1.05, 0.6, mats, raiz)
        m3.caja('Guarda', -1.85, 1.95, s * 1.05 - 0.36, s * 1.05 + 0.36, 1.12, 1.2, P, raiz, biselar=0.02)
    m3.perfil('Cofre', [(-0.1, 1.0), (2.15, 1.0), (2.15, 1.75), (1.9, 1.95), (-0.1, 2.0)], -0.72, 0.72, P, raiz, biselar=0.09)
    m3.caja('Parrilla', 2.14, 2.18, -0.55, 0.55, 1.15, 1.75, mats['tinta'], raiz, biselar=0.01)
    m3.caja('Trasera', -1.7, 0.0, -0.95, 0.95, 0.95, 1.62, P, raiz, biselar=0.06)
    cabina('', -1.5, 0.05, -0.74, 0.74, 1.6, 3.05, mats, raiz, pecho=0.08)
    m3.cilindro('Escape', 0.07, 0.75, mats['cromo'], raiz, eje='Z', centro=(1.25, -0.35, 2.3), lados=16)
    rotular('MDC', raiz, (0.15, 1.45), (1.95, 1.45), 0.725, 0.42, mats['tinta'])
    # La cuchilla: la pieza que dice "bulldozer" antes que cualquier otra.
    concha('Cuchilla', [(2.55, 1.85), (2.45, 1.5), (2.43, 1.0), (2.52, 0.55), (2.72, 0.25), (2.92, 0.16)],
           3.6, mats, raiz, grosor=0.09)
    m3.caja('Filo', 2.78, 2.98, -1.8, 1.8, 0.1, 0.18, mats['acero'], raiz, biselar=0.01)
    for s in (-1, 1):
        tubo('Empujador', (0.3, s * 1.45, 0.6), (2.45, s * 1.45, 0.55), 0.11, P, raiz)
        piston_fijo('PistonCuchilla', (1.6, s * 0.82, 1.85), (2.45, s * 0.95, 1.45), 0.08, mats, raiz)
    # Desgarrador atrás.
    tubo('Desgarrador', (-1.7, 0, 1.1), (-2.45, 0, 0.95), 0.12, P, raiz)
    m3.perfil('Diente', [(-2.35, 1.05), (-2.55, 1.05), (-2.62, 0.25), (-2.5, 0.12), (-2.42, 0.3)],
              -0.09, 0.09, G, raiz, biselar=0.02)
    return raiz


def compactador(mats):
    raiz = m3.vacio('Compactador', (0, 0, 0))
    P, G = mats['pintura'], mats['grafito']
    # El rodillo: acero liso en el centro, tapas amarillas.
    m3.cilindro('Rodillo', 0.78, 2.05, mats['acero'], raiz, centro=(1.6, 0, 0.78), lados=72, biselar=0.03)
    for s in (-1, 1):
        m3.cilindro('Tapa', 0.6, 0.06, G, raiz, centro=(1.6, s * 1.04, 0.78), lados=48, biselar=0.015)
        # El yugo sólo abraza la mitad de arriba: el rodillo tiene que verse.
        m3.perfil('Yugo', [(0.95, 1.05), (2.3, 1.05), (2.6, 1.8), (0.8, 1.8)], s * 1.15 - 0.06, s * 1.15 + 0.06,
                  P, raiz, biselar=0.04)
    m3.caja('Travesano', 0.75, 2.6, -1.2, 1.2, 1.62, 1.85, P, raiz, biselar=0.05)
    m3.caja('Raspador', 2.55, 2.7, -1.05, 1.05, 0.45, 0.6, G, raiz, biselar=0.02)
    m3.caja('Articulacion', 0.25, 0.8, -0.35, 0.35, 0.8, 1.35, G, raiz, biselar=0.04)
    for s in (-1, 1):
        rueda('Rueda', 0.76, 0.62, (-1.55, s * 1.08, 0.76), mats, raiz)
    m3.perfil('Motor', [(-2.65, 0.75), (0.3, 0.75), (0.3, 1.6), (-0.6, 1.78), (-2.65, 1.78)], -0.72, 0.72, P, raiz, biselar=0.09)
    for i in range(5):
        x = -2.3 + i * 0.2
        m3.caja('Rejilla', x, x + 0.1, 0.715, 0.735, 1.1, 1.55, mats['tinta'], raiz, biselar=0.01)
    m3.caja('Plataforma', -0.85, 0.45, -0.9, 0.9, 1.72, 1.82, G, raiz, biselar=0.02)
    rotular('MDC', raiz, (-1.25, 1.22), (0.1, 1.22), 0.725, 0.38, mats['tinta'])
    cabina('', -0.75, 0.4, -0.78, 0.78, 1.82, 3.05, mats, raiz, pecho=0.06)
    return raiz


def minicargador(mats):
    raiz = m3.vacio('Minicargador', (0, 0, 0))
    P, G = mats['pintura'], mats['grafito']
    for x in (-0.62, 0.62):
        for s in (-1, 1):
            rueda('Rueda', 0.42, 0.34, (x, s * 0.86, 0.42), mats, raiz)
    m3.perfil('Cuerpo', [(-1.1, 0.32), (0.78, 0.32), (0.9, 0.78), (0.6, 1.02), (-1.1, 1.2)], -0.67, 0.67, P, raiz, biselar=0.07)
    m3.caja('Puerta', -1.13, -1.08, -0.45, 0.45, 0.45, 1.05, G, raiz, biselar=0.015)
    rotular('MDC', raiz, (-0.75, 0.98), (0.35, 0.98), 0.675, 0.2, mats['tinta'])
    # Cabina: jaula abierta al frente, con vidrio de piso a techo.
    m3.perfil('Cabina', [(-0.62, 0.95), (0.55, 0.95), (0.5, 2.0), (-0.62, 2.0)], -0.5, 0.5, G, raiz, biselar=0.045)
    m3.caja('Techo', -0.7, 0.6, -0.56, 0.56, 1.98, 2.08, P, raiz, biselar=0.03)
    m3.perfil('VidrioFrente', [(0.548, 1.05), (0.565, 1.05), (0.515, 1.93), (0.498, 1.93)], -0.42, 0.42, mats['vidrio'], raiz, biselar=0.004)
    for z in (1.15, 1.45, 1.75):
        m3.caja('Rejilla', -0.52, 0.42, 0.5, 0.515, z, z + 0.18, mats['vidrio'], raiz, biselar=0.005)
    for s in (-1, 1):
        y = s * 0.74
        m3.caja('Torre', -1.12, -0.82, y - 0.07, y + 0.07, 0.9, 1.95, P, raiz, biselar=0.03)
        m3.perfil('Brazo', m3.contorno([(-0.95, 1.85), (-0.2, 2.02), (0.75, 1.62), (1.12, 0.82)], [0.1, 0.12, 0.11, 0.09]),
                  y - 0.06, y + 0.06, P, raiz, biselar=0.025)
        piston_fijo('Piston', (-0.75, y, 1.0), (0.2, y, 1.82), 0.06, mats, raiz)
    concha('Cucharon', [(1.42, 1.05), (1.18, 0.95), (1.1, 0.55), (1.2, 0.28), (1.88, 0.24)], 1.75, mats, raiz, grosor=0.05)
    m3.caja('Filo', 1.75, 1.92, -0.88, 0.88, 0.21, 0.27, mats['acero'], raiz, biselar=0.01)
    return raiz


LARGO = 9.6   # punta de la pluma de la grúa, en metros desde su perno


def grua(mats):
    raiz = m3.vacio('Grua', (0, 0, 0))
    P, G = mats['pintura'], mats['grafito']
    for x in (-1.8, 1.8):
        for s in (-1, 1):
            rueda('Rueda', 0.8, 0.62, (x, s * 1.12, 0.8), mats, raiz)
    m3.perfil('Chasis', [(-3.0, 0.75), (3.0, 0.75), (3.15, 1.2), (3.0, 1.55), (-3.0, 1.55)], -0.92, 0.92, P, raiz, biselar=0.07)
    for x in (-2.75, 2.75):
        for s in (-1, 1):
            m3.caja('Estabilizador', x - 0.2, x + 0.2, s * 0.9 - 0.25 * (s < 0), s * 0.9 + 0.25 * (s > 0), 0.85, 1.25,
                    G, raiz, biselar=0.03)
    for s in (-1, 1):
        m3.caja('Salpicadera', -2.7, 2.7, s * 1.12 - 0.34, s * 1.12 + 0.34, 1.62, 1.68, G, raiz, biselar=0.02)
    m3.cilindro('Tornamesa', 0.9, 0.18, mats['tinta'], raiz, eje='Z', centro=(-0.3, 0, 1.64), lados=48, biselar=0.02)
    m3.caja('Superestructura', -2.0, 0.9, -0.9, 0.55, 1.72, 2.3, P, raiz, biselar=0.06)
    m3.caja('Contrapeso', -2.55, -1.85, -0.95, 0.95, 1.7, 2.55, G, raiz, biselar=0.18, segmentos=4, angulo=60)
    cabina('', 0.0, 1.25, 0.32, 1.02, 1.72, 2.95, mats, raiz, pecho=0.15)
    # Pluma telescópica: tres tramos, cada uno un poco más delgado, y el
    # gancho colgando de la punta. Es la silueta que reconoce cualquiera.
    pluma = m3.vacio('Pluma', (-1.55, -0.2, 2.55), raiz)
    # Pluma corta y empinada: con la de verdad (12 m tendida) el camión quedaba
    # como un punto al pie de una raya, y en la tarjeta no se leía qué era.
    pluma.rotation_euler = (0, math.radians(-38), 0)
    tramos = ((0.0, 4.2, 0.62, 0.52), (3.9, 7.0, 0.5, 0.42), (6.7, LARGO, 0.4, 0.33))
    for i, (x0, x1, alto, ancho) in enumerate(tramos):
        m3.caja(f'Tramo{i}', x0 - 0.3, x1, -ancho / 2, ancho / 2, -alto / 2, alto / 2, P, pluma, biselar=0.05)
    m3.cilindro('Polea', 0.22, 0.36, mats['acero'], pluma, centro=(LARGO + 0.05, 0, 0.0), lados=32, biselar=0.02)
    rotular('MDC', pluma, (0.9, 0.0), (3.6, 0.0), tramos[0][3] / 2 + 0.003, 0.36, mats['tinta'])
    eje = Vector((math.cos(math.radians(38)), 0, math.sin(math.radians(38))))
    base = Vector((-1.55, -0.2, 2.55))
    piston_fijo('PistonPluma', (0.55, -0.2, 1.8), base + eje * 2.6 - Vector((0, 0, 0.3)), 0.15, mats, raiz)
    punta = base + eje * (LARGO + 0.2)
    gancho_z = punta.z - 3.0
    tubo('Cable', punta, (punta.x, punta.y, gancho_z + 0.35), 0.018, mats['tinta'], raiz)
    m3.caja('Motón', punta.x - 0.22, punta.x + 0.22, punta.y - 0.18, punta.y + 0.18, gancho_z - 0.1, gancho_z + 0.4,
            P, raiz, biselar=0.04)
    m3.perfil('Gancho', [(punta.x - 0.05, gancho_z - 0.1), (punta.x + 0.05, gancho_z - 0.1), (punta.x + 0.05, gancho_z - 0.35),
                         (punta.x - 0.16, gancho_z - 0.5), (punta.x - 0.2, gancho_z - 0.38), (punta.x - 0.12, gancho_z - 0.36),
                         (punta.x - 0.05, gancho_z - 0.3)], punta.y - 0.04, punta.y + 0.04, mats['acero'], raiz, biselar=0.01)
    return raiz


MAQUINAS = {
    'excavadora': excavadora, 'retro': retro, 'bulldozer': bulldozer,
    'compactador': compactador, 'minicargador': minicargador, 'grua': grua,
}


# ══════════════════ ESTUDIO ══════════════════

def estudio(muestras):
    e = bpy.context.scene
    e.render.engine = 'CYCLES'
    e.cycles.device = 'CPU'
    e.cycles.samples = muestras
    e.cycles.use_denoising = True
    e.render.resolution_x, e.render.resolution_y, e.render.resolution_percentage = ANCHO, ALTO, 100
    e.render.film_transparent = True
    e.view_settings.view_transform = m3.VISTA
    e.world = bpy.data.worlds.new('Mundo')
    e.world.use_nodes = True
    # Un entorno gris claro: lo que se refleja en la pintura. Sobre la tarjeta
    # clara, un reflejo negro (el del video) se vería sucio.
    fondo = e.world.node_tree.nodes['Background']
    fondo.inputs['Color'].default_value = m3.lineal('#D9D6CE')
    fondo.inputs['Strength'].default_value = 0.55


def encuadrar(raiz):
    """Cámara de tres cuartos que se acerca hasta que la máquina llena el cuadro."""
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in [raiz] + list(raiz.children_recursive)
           if o.type in {'MESH', 'FONT'} for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centro = (mn + mx) / 2
    cam = m3.camara('Camara', lente=55)
    az, el = math.radians(52), math.radians(14)
    direccion = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    m3.apuntar(cam, centro + direccion * 30, centro)
    bpy.context.view_layer.update()
    planos = [c for p in pts for c in p]
    lugar, _ = cam.camera_fit_coords(bpy.context.evaluated_depsgraph_get(), planos)
    cam.location = centro + (Vector(lugar) - centro) * 1.16
    return centro, mx - mn


def atrapasombras(centro, tam):
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=max(tam.x, tam.y) * 1.5)
    me = bpy.data.meshes.new('Sombra')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Sombra', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (centro.x, centro.y, 0)
    ob.is_shadow_catcher = True


def difuminar_bordes(e, origen, destino, margen=0.14):
    """Apaga la sombra hacia las orillas de la imagen.

    El atrapasombras guarda también un velo de sombra muy tenue en todo el
    piso, y al llegar al borde del cuadro se corta en seco: sobre el fondo de
    la ficha se veía el rectángulo de la imagen. Con esto el velo se
    desvanece antes de llegar a la orilla. La máquina no se toca: el encuadre
    le deja más margen que esto."""
    import numpy as np
    img = bpy.data.images.load(origen)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    def rampa(n):
        t = np.minimum(np.arange(n), np.arange(n)[::-1]) / (n * margen)
        t = np.clip(t, 0, 1)
        return t * t * (3 - 2 * t)
    px[..., 3] *= rampa(h)[:, None] * rampa(w)[None, :]
    img.pixels[:] = px.ravel()
    ajustes = e.render.image_settings
    ajustes.file_format = 'WEBP'
    ajustes.color_mode = 'RGBA'
    ajustes.quality = 68
    img.save_render(destino, scene=e)
    bpy.data.images.remove(img)


def main():
    op = argumentos()
    salida = os.path.abspath(op['salida'] or 'assets/3d/maquinas')
    os.makedirs(salida, exist_ok=True)
    for clave, construir in MAQUINAS.items():
        if op['solo'] and clave not in op['solo']:
            continue
        m3.limpiar()
        estudio(op['muestras'])
        mats = m3.materiales()
        raiz = construir(mats)
        centro, tam = encuadrar(raiz)
        atrapasombras(centro, tam)
        # Contraluces a un tercio: sobre fondo oscuro dibujan el borde; sobre la
        # tarjeta clara sólo teñían de violeta las llantas.
        m3.iluminar(centro=tuple(centro), escala=max(tam.x, tam.z) / 7.5, contraluz=0.3)
        e = bpy.context.scene
        e.render.image_settings.file_format = 'PNG'
        e.render.image_settings.color_mode = 'RGBA'
        e.render.filepath = os.path.join(salida, clave + '.tmp.png')
        bpy.ops.render.render(write_still=True)
        destino = os.path.join(salida, clave + '.webp')
        difuminar_bordes(e, e.render.filepath, destino)
        os.remove(e.render.filepath)
        print(f'MDC {clave}.webp: {os.path.getsize(destino) / 1024:.0f} kB')


if __name__ == '__main__':
    main()
