(function(root){'use strict';const layouts={
  "1": {
    "s1_blackhole": {
      "x": 42.81,
      "y": 69.394
    },
    "s1_pulsar": {
      "x": 15.917,
      "y": 77.879
    },
    "s1_station_l": {
      "x": 23.381,
      "y": 59.242
    },
    "s1_unknown_l": {
      "x": 10.538,
      "y": 45.455
    },
    "s1_fortress": {
      "x": 23.93,
      "y": 33.485
    },
    "s1_nebula": {
      "x": 15.038,
      "y": 15
    },
    "s1_station_u": {
      "x": 34.248,
      "y": 12.879
    },
    "s1_white_dwarf": {
      "x": 69.374,
      "y": 17.424
    },
    "s1_warp": {
      "x": 82.547,
      "y": 10
    },
    "s1_star_system": {
      "x": 89.243,
      "y": 24.394
    },
    "s1_station_r": {
      "x": 73.216,
      "y": 37.424
    },
    "s1_supernova": {
      "x": 64.544,
      "y": 55.758
    },
    "s1_unknown_r": {
      "x": 86.279,
      "y": 49.242
    },
    "s1_asteroids": {
      "x": 89.243,
      "y": 68.182
    },
    "s1_station_br": {
      "x": 79.144,
      "y": 81.97
    },
    "s1_supergiant": {
      "x": 63.117,
      "y": 87.121
    }
  },
  "2": {
    "s2_warp": {
      "x": 30.296,
      "y": 30.702
    },
    "s2_station_u": {
      "x": 43.469,
      "y": 19.649
    },
    "s2_superblackhole": {
      "x": 57.519,
      "y": 13.684
    },
    "s2_gravitytrap": {
      "x": 71.24,
      "y": 12.105
    },
    "s2_quark": {
      "x": 82.986,
      "y": 16.316
    },
    "s2_worm_r": {
      "x": 89.243,
      "y": 26.667
    },
    "s2_unknown_r": {
      "x": 89.133,
      "y": 41.228
    },
    "s2_station_r": {
      "x": 81.12,
      "y": 54.211
    },
    "s2_antimatter": {
      "x": 70.143,
      "y": 68.596
    },
    "s2_unknown_b": {
      "x": 56.751,
      "y": 78.246
    },
    "s2_wreck": {
      "x": 42.81,
      "y": 84.386
    },
    "s2_station_bl": {
      "x": 29.089,
      "y": 86.667
    },
    "s2_crystal": {
      "x": 17.344,
      "y": 82.632
    },
    "s2_worm_l": {
      "x": 10.757,
      "y": 71.579
    },
    "s2_chaos": {
      "x": 10.867,
      "y": 58.772
    },
    "s2_unknown_l": {
      "x": 19.539,
      "y": 43.333
    }
  },
  "3": {
    "s3_worm_ul": {
      "x": 8.891,
      "y": 29.571
    },
    "s3_dense": {
      "x": 20.088,
      "y": 23
    },
    "s3_station_u": {
      "x": 33.041,
      "y": 17
    },
    "s3_vortex": {
      "x": 49.835,
      "y": 16.143
    },
    "s3_relic": {
      "x": 66.959,
      "y": 17.143
    },
    "s3_tunnel_ur": {
      "x": 78.924,
      "y": 23.143
    },
    "s3_hypertrap": {
      "x": 91.218,
      "y": 29.571
    },
    "s3_worm_lr": {
      "x": 91.218,
      "y": 77.714
    },
    "s3_tunnel_ll": {
      "x": 20.198,
      "y": 84.571
    },
    "s3_station_d": {
      "x": 33.15,
      "y": 90.714
    },
    "s3_warp": {
      "x": 67.069,
      "y": 90.714
    },
    "s3_gravity": {
      "x": 79.912,
      "y": 84.571
    },
    "s3_primordial": {
      "x": 8.891,
      "y": 77.714
    },
    "s3_halo": {
      "x": 15.038,
      "y": 52.857
    },
    "s3_unknown_l": {
      "x": 27.881,
      "y": 53.286
    },
    "s3_eye": {
      "x": 50.055,
      "y": 53.429
    },
    "s3_unknown_r": {
      "x": 72.119,
      "y": 53.286
    },
    "s3_whitehole": {
      "x": 84.962,
      "y": 52.714
    }
  }
};
const art={"1":"<svg class=\"original-map-art\" viewBox=\"0 1320 911 660\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><defs><filter id=\"hide-print-routes\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 8 0 -8 0 -.5\" result=\"warm\"/><feComposite in=\"SourceGraphic\" in2=\"warm\" operator=\"out\"/></filter><filter id=\"art-soft-mask\"><feGaussianBlur stdDeviation=\"4\"/></filter><mask id=\"original-art-mask-1\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"911\" height=\"2048\"><rect width=\"911\" height=\"2048\" fill=\"white\"/><ellipse cx=\"390\" cy=\"1778\" rx=\"64\" ry=\"57\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"145\" cy=\"1834\" rx=\"55\" ry=\"55\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"213\" cy=\"1711\" rx=\"64\" ry=\"66\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"96\" cy=\"1620\" rx=\"65\" ry=\"61\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"218\" cy=\"1541\" rx=\"76\" ry=\"83\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"137\" cy=\"1419\" rx=\"55\" ry=\"58\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"312\" cy=\"1405\" rx=\"65\" ry=\"66\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"632\" cy=\"1435\" rx=\"64\" ry=\"63\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"752\" cy=\"1386\" rx=\"69\" ry=\"67\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"813\" cy=\"1481\" rx=\"52\" ry=\"52\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"667\" cy=\"1567\" rx=\"62\" ry=\"63\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"588\" cy=\"1688\" rx=\"68\" ry=\"68\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"786\" cy=\"1645\" rx=\"72\" ry=\"64\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"813\" cy=\"1770\" rx=\"70\" ry=\"70\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"721\" cy=\"1861\" rx=\"62\" ry=\"70\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"575\" cy=\"1895\" rx=\"54\" ry=\"52\" fill=\"black\" filter=\"url(#art-soft-mask)\"/></mask></defs><image href=\"assets/original-map.webp\" x=\"0\" y=\"0\" width=\"911\" height=\"2048\" preserveAspectRatio=\"none\" filter=\"url(#hide-print-routes)\" mask=\"url(#original-art-mask-1)\"/></svg>","2":"<svg class=\"original-map-art\" viewBox=\"0 745 911 570\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><defs><filter id=\"hide-print-routes\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 8 0 -8 0 -.5\" result=\"warm\"/><feComposite in=\"SourceGraphic\" in2=\"warm\" operator=\"out\"/></filter><filter id=\"art-soft-mask\"><feGaussianBlur stdDeviation=\"4\"/></filter><mask id=\"original-art-mask-2\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"911\" height=\"2048\"><rect width=\"911\" height=\"2048\" fill=\"white\"/><ellipse cx=\"276\" cy=\"920\" rx=\"70\" ry=\"36\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"396\" cy=\"857\" rx=\"69\" ry=\"43\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"524\" cy=\"823\" rx=\"69\" ry=\"44\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"649\" cy=\"814\" rx=\"69\" ry=\"43\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"756\" cy=\"838\" rx=\"67\" ry=\"40\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"813\" cy=\"897\" rx=\"69\" ry=\"39\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"812\" cy=\"980\" rx=\"68\" ry=\"39\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"739\" cy=\"1054\" rx=\"68\" ry=\"42\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"639\" cy=\"1136\" rx=\"68\" ry=\"39\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"517\" cy=\"1191\" rx=\"69\" ry=\"40\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"390\" cy=\"1226\" rx=\"68\" ry=\"40\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"265\" cy=\"1239\" rx=\"69\" ry=\"41\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"158\" cy=\"1216\" rx=\"69\" ry=\"43\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"98\" cy=\"1153\" rx=\"69\" ry=\"40\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"99\" cy=\"1080\" rx=\"67\" ry=\"45\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"178\" cy=\"992\" rx=\"69\" ry=\"42\" fill=\"black\" filter=\"url(#art-soft-mask)\"/></mask></defs><image href=\"assets/original-map.webp\" x=\"0\" y=\"0\" width=\"911\" height=\"2048\" preserveAspectRatio=\"none\" filter=\"url(#hide-print-routes)\" mask=\"url(#original-art-mask-2)\"/></svg>","3":"<svg class=\"original-map-art\" viewBox=\"0 40 911 700\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><defs><filter id=\"hide-print-routes\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 8 0 -8 0 -.5\" result=\"warm\"/><feComposite in=\"SourceGraphic\" in2=\"warm\" operator=\"out\"/></filter><filter id=\"art-soft-mask\"><feGaussianBlur stdDeviation=\"4\"/></filter><mask id=\"original-art-mask-3\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"911\" height=\"2048\"><rect width=\"911\" height=\"2048\" fill=\"white\"/><ellipse cx=\"81\" cy=\"247\" rx=\"49\" ry=\"49\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"183\" cy=\"201\" rx=\"59\" ry=\"59\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"301\" cy=\"159\" rx=\"66\" ry=\"67\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"454\" cy=\"153\" rx=\"57\" ry=\"58\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"610\" cy=\"160\" rx=\"68\" ry=\"68\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"719\" cy=\"202\" rx=\"58\" ry=\"57\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"81\" cy=\"584\" rx=\"48\" ry=\"49\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"831\" cy=\"584\" rx=\"49\" ry=\"49\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"184\" cy=\"632\" rx=\"59\" ry=\"59\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"302\" cy=\"675\" rx=\"66\" ry=\"67\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"611\" cy=\"675\" rx=\"67\" ry=\"66\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"728\" cy=\"632\" rx=\"59\" ry=\"59\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"831\" cy=\"247\" rx=\"50\" ry=\"49\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"137\" cy=\"410\" rx=\"60\" ry=\"62\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"254\" cy=\"413\" rx=\"53\" ry=\"53\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"456\" cy=\"414\" rx=\"58\" ry=\"50\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"657\" cy=\"413\" rx=\"52\" ry=\"53\" fill=\"black\" filter=\"url(#art-soft-mask)\"/><ellipse cx=\"774\" cy=\"409\" rx=\"62\" ry=\"63\" fill=\"black\" filter=\"url(#art-soft-mask)\"/></mask></defs><image href=\"assets/original-map.webp\" x=\"0\" y=\"0\" width=\"911\" height=\"2048\" preserveAspectRatio=\"none\" filter=\"url(#hide-print-routes)\" mask=\"url(#original-art-mask-3)\"/></svg>"};const api={art,version:'1.0.3',layouts,positions(stage){return layouts[stage];}};if(typeof module!=='undefined')module.exports=api;else root.StarSeaMapArt=api;})(typeof window!=='undefined'?window:globalThis);
