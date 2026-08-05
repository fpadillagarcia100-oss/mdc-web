/**
 * catalogo-datos.js — GENERADO AUTOMÁTICAMENTE. No lo edites a mano.
 *
 * Se produce con "npm run build" a partir de data/catalogo.json.
 * Cualquier cambio aquí se pierde en la siguiente compilación.
 */
'use strict';

/* Huella de data/catalogo.json al momento de generar. La verifica
   "npm run test:generado" para que nadie publique fichas desactualizadas. */
const CATALOGO_HUELLA = '6874c04da0758f46';

const CATALOGO = {
  "ajustes": {
    "marca_principal": "MD",
    "marca_acento": "C",
    "marca_completa": "Maquinaria de Chiapas",
    "color_acento": "#F5C400",
    "logo": null,
    "barra_superior": "🚧 Cobertura en todo Chiapas y el Sureste · Financiamiento disponible",
    "hero_etiqueta": "🏗️ Temporada de obra 2026",
    "hero_titulo": "Equipos de construcción",
    "hero_resaltado": "hasta 18 meses sin intereses",
    "hero_texto": "Las mejores marcas: CAT, Komatsu, JCB, Bobcat y Liebherr. Equipos nuevos y certificados con garantía, entregados en tu obra.",
    "hero_imagen": null,
    "vendedor": "MDC Maquinaria de Chiapas",
    "telefono": "961 123 4567",
    "whatsapp": "5219611234567",
    "correo": "ventas@mdcmaquinaria.com",
    "horario": "Lun–Vie 8:00–18:00 · Sáb 9:00–14:00",
    "direccion": "Tuxtla Gutiérrez, Chiapas",
    "pie_descripcion": "Venta y renta de maquinaria pesada en Chiapas. Equipos verificados, garantía real y financiamiento a la medida de tu obra."
  },
  "sucursales": [
    {
      "name": "Matriz Tuxtla Gutiérrez",
      "address": "Blvd. Belisario Domínguez 1250, Tuxtla Gutiérrez, Chiapas",
      "phone": "961 123 4567",
      "hours": "Lun–Vie 8:00–18:00 · Sáb 9:00–14:00"
    },
    {
      "name": "Sucursal Tapachula",
      "address": "Carretera Costera km 4, Tapachula, Chiapas",
      "phone": "962 123 4567",
      "hours": "Lun–Vie 8:00–18:00"
    },
    {
      "name": "Sucursal San Cristóbal",
      "address": "Carretera Panamericana 890, San Cristóbal de las Casas, Chiapas",
      "phone": "967 123 4567",
      "hours": "Lun–Vie 9:00–17:00"
    }
  ],
  "equipos": [
    {
      "slug": "excavadora-cat-320-gc",
      "id": 1,
      "name": "Excavadora CAT 320 GC",
      "brand": "CAT",
      "cat": "Excavación",
      "cond": "Nuevo",
      "price": 2850000,
      "original": 3100000,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tuxtla Gutiérrez",
      "year": 2025,
      "specs": [
        "20 ton",
        "148 HP",
        "6.5 m alcance"
      ],
      "desc": "Excavadora hidráulica de cadenas con sistema de gestión inteligente. Ideal para obra urbana y movimiento de tierra de mediana escala.",
      "svgKey": "excavadora",
      "img": null,
      "hot": true
    },
    {
      "slug": "excavadora-cat-336",
      "id": 2,
      "name": "Excavadora CAT 336",
      "brand": "CAT",
      "cat": "Excavación",
      "cond": "Nuevo",
      "price": 4200000,
      "original": null,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tapachula",
      "year": 2025,
      "specs": [
        "36 ton",
        "270 HP",
        "7.8 m alcance"
      ],
      "desc": "Máxima potencia para proyectos de gran envergadura. Motor ACERT con tecnología de reducción de emisiones.",
      "svgKey": "excavadora",
      "img": null
    },
    {
      "slug": "excavadora-komatsu-pc290",
      "id": 3,
      "name": "Excavadora Komatsu PC290",
      "brand": "Komatsu",
      "cat": "Excavación",
      "cond": "Usado",
      "price": 1650000,
      "original": 2200000,
      "finance": "12 MSI",
      "leasing": true,
      "shipping": false,
      "location": "San Cristóbal de las Casas",
      "year": 2021,
      "specs": [
        "29 ton",
        "197 HP",
        "2,400 hrs"
      ],
      "desc": "Excavadora seminueva en excelentes condiciones. Con certificado de inspección y garantía de 6 meses.",
      "svgKey": "excavadora",
      "img": null
    },
    {
      "slug": "retroexcavadora-jcb-3cx-pro",
      "id": 4,
      "name": "Retroexcavadora JCB 3CX Pro",
      "brand": "JCB",
      "cat": "Carga",
      "cond": "Nuevo",
      "price": 980000,
      "original": 1050000,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tuxtla Gutiérrez",
      "year": 2025,
      "specs": [
        "8.5 ton",
        "109 HP",
        "4WD"
      ],
      "desc": "La retroexcavadora más vendida en México. Versatilidad total para obra civil, drenaje y construcción.",
      "svgKey": "retro",
      "img": null,
      "hot": true
    },
    {
      "slug": "retroexcavadora-jcb-4cx",
      "id": 5,
      "name": "Retroexcavadora JCB 4CX",
      "brand": "JCB",
      "cat": "Carga",
      "cond": "Nuevo",
      "price": 1380000,
      "original": null,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Comitán",
      "year": 2025,
      "specs": [
        "10 ton",
        "115 HP",
        "4WD extendido"
      ],
      "desc": "Versión extendida con mayor alcance y potencia. Ideal para obras en zonas rurales y caminos.",
      "svgKey": "retro",
      "img": null
    },
    {
      "slug": "retroexcavadora-cat-416f2",
      "id": 6,
      "name": "Retroexcavadora CAT 416F2",
      "brand": "CAT",
      "cat": "Carga",
      "cond": "Usado",
      "price": 750000,
      "original": 920000,
      "finance": "6 MSI",
      "leasing": false,
      "shipping": false,
      "location": "Tapachula",
      "year": 2020,
      "specs": [
        "7.8 ton",
        "95 HP",
        "2,800 hrs"
      ],
      "desc": "Unidad verificada y lista para trabajar. Mantenimiento al día con bitácora completa.",
      "svgKey": "retro",
      "img": null
    },
    {
      "slug": "bulldozer-komatsu-d65px",
      "id": 7,
      "name": "Bulldozer Komatsu D65PX",
      "brand": "Komatsu",
      "cat": "Nivelación",
      "cond": "Nuevo",
      "price": 3750000,
      "original": null,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tapachula",
      "year": 2025,
      "specs": [
        "21 ton",
        "228 HP",
        "Ripper incl."
      ],
      "desc": "Dozer de alta productividad para nivelación de grandes volúmenes. Sistema de tracción hidrostática.",
      "svgKey": "bulldozer",
      "img": null
    },
    {
      "slug": "bulldozer-cat-d6t",
      "id": 8,
      "name": "Bulldozer CAT D6T",
      "brand": "CAT",
      "cat": "Nivelación",
      "cond": "Nuevo",
      "price": 4900000,
      "original": 5200000,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tuxtla Gutiérrez",
      "year": 2025,
      "specs": [
        "24 ton",
        "215 HP",
        "GPS Ready"
      ],
      "desc": "El estándar de la industria. Con sensor de pendiente integrado y sistema CAT LINK para telemetría.",
      "svgKey": "bulldozer",
      "img": null
    },
    {
      "slug": "bulldozer-komatsu-d51i",
      "id": 9,
      "name": "Bulldozer Komatsu D51i",
      "brand": "Komatsu",
      "cat": "Nivelación",
      "cond": "Renta",
      "price": 42000,
      "original": null,
      "finance": null,
      "leasing": false,
      "shipping": false,
      "location": "San Cristóbal de las Casas",
      "year": 2023,
      "specs": [
        "14.6 ton",
        "130 HP",
        "Inteligente"
      ],
      "desc": "Disponible en renta mensual. Incluye operador, seguro y mantenimiento preventivo.",
      "svgKey": "bulldozer",
      "img": null
    },
    {
      "slug": "compactador-dynapac-ca250",
      "id": 10,
      "name": "Compactador Dynapac CA250",
      "brand": "Dynapac",
      "cat": "Compactación",
      "cond": "Nuevo",
      "price": 1200000,
      "original": 1350000,
      "finance": "12 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Comitán",
      "year": 2025,
      "specs": [
        "10 ton",
        "138 HP",
        "2 tambores"
      ],
      "desc": "Rodillo tándem vibratorio para asfalto. Sistema SEISMIC para control automático de compactación.",
      "svgKey": "compactador",
      "img": null
    },
    {
      "slug": "compactador-bomag-bw-216",
      "id": 11,
      "name": "Compactador Bomag BW 216",
      "brand": "Bomag",
      "cat": "Compactación",
      "cond": "Usado",
      "price": 680000,
      "original": 880000,
      "finance": "6 MSI",
      "leasing": false,
      "shipping": false,
      "location": "San Cristóbal de las Casas",
      "year": 2019,
      "specs": [
        "16 ton",
        "159 HP",
        "3,100 hrs"
      ],
      "desc": "Rodillo de suelos en buen estado. Inspección técnica reciente, todos los sistemas en óptimas condiciones.",
      "svgKey": "compactador",
      "img": null
    },
    {
      "slug": "compactador-cat-cs533",
      "id": 12,
      "name": "Compactador CAT CS533",
      "brand": "CAT",
      "cat": "Compactación",
      "cond": "Renta",
      "price": 28000,
      "original": null,
      "finance": null,
      "leasing": false,
      "shipping": false,
      "location": "Tuxtla Gutiérrez",
      "year": 2022,
      "specs": [
        "12 ton",
        "141 HP",
        "Vibratorio"
      ],
      "desc": "Renta mensual con todas las facilidades. Entrega en sitio sin costo en la zona metropolitana de Tuxtla.",
      "svgKey": "compactador",
      "img": null
    },
    {
      "slug": "minicargador-bobcat-s650",
      "id": 13,
      "name": "Minicargador Bobcat S650",
      "brand": "Bobcat",
      "cat": "Carga",
      "cond": "Nuevo",
      "price": 520000,
      "original": 580000,
      "finance": "12 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tuxtla Gutiérrez",
      "year": 2025,
      "specs": [
        "3.5 ton",
        "74 HP",
        "Multi-attach"
      ],
      "desc": "El más ágil para espacios confinados. Sistema de acople rápido compatible con más de 100 aditamentos.",
      "svgKey": "minicargador",
      "img": null,
      "hot": true
    },
    {
      "slug": "minicargador-cat-262d3",
      "id": 14,
      "name": "Minicargador CAT 262D3",
      "brand": "CAT",
      "cat": "Carga",
      "cond": "Nuevo",
      "price": 610000,
      "original": null,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Tapachula",
      "year": 2025,
      "specs": [
        "4.0 ton",
        "90 HP",
        "Cabina ROPS"
      ],
      "desc": "Mayor capacidad de carga con visibilidad total. Sistema CAT SMART ATTACH para cambio rápido.",
      "svgKey": "minicargador",
      "img": null
    },
    {
      "slug": "minicargador-bobcat-t450",
      "id": 15,
      "name": "Minicargador Bobcat T450",
      "brand": "Bobcat",
      "cat": "Carga",
      "cond": "Renta",
      "price": 18000,
      "original": null,
      "finance": null,
      "leasing": false,
      "shipping": false,
      "location": "Tuxtla Gutiérrez",
      "year": 2023,
      "specs": [
        "3.2 ton",
        "66 HP",
        "Cadenas"
      ],
      "desc": "Versión de cadenas para terreno blando. Renta semanal o mensual disponible.",
      "svgKey": "minicargador",
      "img": null
    },
    {
      "slug": "grua-torre-liebherr-160ec",
      "id": 16,
      "name": "Grúa Torre Liebherr 160EC",
      "brand": "Liebherr",
      "cat": "Elevación",
      "cond": "Nuevo",
      "price": 6800000,
      "original": null,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": false,
      "location": "Tuxtla Gutiérrez",
      "year": 2025,
      "specs": [
        "8 ton punta",
        "50 m pluma",
        "Montaje incl."
      ],
      "desc": "Ideal para edificios de hasta 20 niveles. Montaje, operación e instalación eléctrica incluidos.",
      "svgKey": "grua",
      "img": null
    },
    {
      "slug": "grua-torre-potain-mdt-178",
      "id": 17,
      "name": "Grúa Torre Potain MDT 178",
      "brand": "Potain",
      "cat": "Elevación",
      "cond": "Renta",
      "price": 85000,
      "original": null,
      "finance": null,
      "leasing": false,
      "shipping": false,
      "location": "Tapachula",
      "year": 2022,
      "specs": [
        "6 ton punta",
        "45 m pluma",
        "Full servicio"
      ],
      "desc": "Renta mensual con operador certificado, mantenimiento y seguro de responsabilidad civil.",
      "svgKey": "grua",
      "img": null
    },
    {
      "slug": "retroexcavadora-komatsu-wb97",
      "id": 18,
      "name": "Retroexcavadora Komatsu WB97",
      "brand": "Komatsu",
      "cat": "Carga",
      "cond": "Nuevo",
      "price": 1150000,
      "original": 1280000,
      "finance": "18 MSI",
      "leasing": true,
      "shipping": true,
      "location": "Palenque",
      "year": 2025,
      "specs": [
        "9.5 ton",
        "97 HP",
        "4WD"
      ],
      "desc": "Potencia Komatsu con bajo consumo de combustible. Cabina ergonómica con A/C de serie.",
      "svgKey": "retro",
      "img": null
    }
  ]
};
