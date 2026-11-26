"""
codificar.py — Convierte los cuadros del hero en lo que se publica: dos videos
y una imagen fija.

Parte de MDC · Maquinaria de Chiapas.

    blender -b --factory-startup -P tools/blender/codificar.py -- --cuadros DIR --salida assets/3d

Usa el FFmpeg que trae Blender dentro, a propósito: así `npm run render3d`
sólo necesita Blender instalado, no un FFmpeg aparte con su propia versión y
sus propias opciones por defecto.

── Por qué dos videos ──

  excavadora.webm   VP9. Lo reproducen Chrome, Edge, Firefox y Safari 14.1+.
                    Es el más ligero, así que va primero en la lista.
  excavadora.mp4    H.264. El que reproduce cualquier cosa. El navegador
                    elige UNO de los dos, el primero que entiende; nunca baja
                    los dos.

No llevan canal alfa. El video trae pintado su propio fondo —la misma aurora
del hero— porque Safari no reproduce WebM con transparencia y el HEVC con
alfa que sí entiende pesa cuatro veces más. Un fondo horneado se ve igual en
todos lados y pesa lo mismo que nada: el códec casi no gasta bits en un
degradado que no se mueve.

── Por qué esta calidad ──

El video se ve en una vitrina de 400×320 px, detrás de un vidrio, flotando.
Se probó CRF 40 (VP9): 140 kB, con escalones de color en el degradado del
fondo. CRF 34 los quita y deja el video en ~200 kB, la mitad del tope que
vigila render-3d.js. Más calidad que eso no se ve a ese tamaño; más peso sí
se nota en la señal de una obra. El H.264 va en 27, que da lo mismo a ojo.
"""
import os
import sys

import bpy


def argumentos():
    a = sys.argv[sys.argv.index('--') + 1:]
    return {a[i].lstrip('-'): a[i + 1] for i in range(0, len(a) - 1, 2)}


def escena_de_video(cuadros, archivos, fps):
    e = bpy.data.scenes.new('codificar')
    e.sequence_editor_create()
    strips = e.sequence_editor.strips if hasattr(e.sequence_editor, 'strips') else e.sequence_editor.sequences
    tira = strips.new_image('cuadros', os.path.join(cuadros, archivos[0]), 1, 1)
    for f in archivos[1:]:
        tira.elements.append(f)
    e.frame_start, e.frame_end = 1, len(archivos)
    e.render.fps = fps
    primer = bpy.data.images.load(os.path.join(cuadros, archivos[0]))
    e.render.resolution_x, e.render.resolution_y = primer.size
    e.render.resolution_percentage = 100
    # Los PNG ya salieron con su transformación de color aplicada: aquí no se
    # vuelve a tocar, o el amarillo se lavaría dos veces.
    e.view_settings.view_transform = 'Standard'
    e.sequencer_colorspace_settings.name = 'sRGB'
    return e


def a_video(e, ruta, contenedor, codec, crf):
    ajustes = e.render.image_settings
    if hasattr(ajustes, 'media_type'):
        ajustes.media_type = 'VIDEO'
    ajustes.file_format = 'FFMPEG'
    ajustes.color_mode = 'RGB'
    ff = e.render.ffmpeg
    ff.format = contenedor
    ff.codec = codec
    ff.constant_rate_factor = 'CUSTOM'
    ff.custom_constant_rate_factor = crf
    ff.ffmpeg_preset = 'BEST'
    # Un solo cuadro clave al principio: el video da la vuelta sobre sí mismo
    # y nunca se adelanta, así que no hace falta poder saltar a la mitad. Cada
    # cuadro clave de más son kilobytes que no se ven.
    ff.gopsize = e.frame_end
    ff.audio_codec = 'NONE'
    e.render.filepath = ruta
    # Blender agrega el rango de cuadros al nombre si no le dices lo contrario.
    e.render.use_file_extension = False
    bpy.ops.render.render(animation=True, scene=e.name)


def a_imagen(ruta_png, ruta, formato, calidad):
    e = bpy.context.scene
    img = bpy.data.images.load(ruta_png)
    ajustes = e.render.image_settings
    if hasattr(ajustes, 'media_type'):
        ajustes.media_type = 'IMAGE'
    ajustes.file_format = formato
    ajustes.color_mode = 'RGB'
    ajustes.quality = calidad
    e.view_settings.view_transform = 'Standard'
    img.save_render(ruta, scene=e)


def main():
    op = argumentos()
    cuadros, salida = op['cuadros'], op['salida']
    nombre = op.get('nombre', 'excavadora')
    os.makedirs(salida, exist_ok=True)
    archivos = sorted(f for f in os.listdir(cuadros) if f.startswith('c') and f.endswith('.png'))
    if not archivos:
        sys.exit(f'No hay cuadros en {cuadros}')

    # El cartel es el PRIMER cuadro del ciclo, no uno cualquiera: el video
    # arranca justo ahí, así que el paso de la imagen fija al video no salta.
    a_imagen(os.path.join(cuadros, archivos[0]), os.path.join(salida, nombre + '.webp'), 'WEBP',
             int(op.get('calidad_cartel', 72)))

    e = escena_de_video(cuadros, archivos, int(op.get('fps', 24)))
    a_video(e, os.path.join(salida, nombre + '.webm'), 'WEBM', 'WEBM', int(op.get('crf_webm', 34)))
    a_video(e, os.path.join(salida, nombre + '.mp4'), 'MPEG4', 'H264', int(op.get('crf_mp4', 27)))
    for ext in ('webp', 'webm', 'mp4'):
        ruta = os.path.join(salida, f'{nombre}.{ext}')
        print(f'MDC {nombre}.{ext}: {os.path.getsize(ruta) / 1024:.0f} kB')


main()
