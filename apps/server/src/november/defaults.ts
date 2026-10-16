import type {
  NovDestinationContent,
  NovDestinationId,
  NovItineraryDayInput,
  NovPackingItemInput,
} from '@blink/contract/november';

/**
 * The seed: what the two of them start with. Destinations are facts; itinerary and packing are
 * suggestions they edit freely and can reset to this. German, because the site is.
 */
export interface NovDestinationSeed {
  id: NovDestinationId;
  content: NovDestinationContent;
  itinerary: readonly NovItineraryDayInput[];
  packing: readonly NovPackingItemInput[];
}

export const novSeed: readonly NovDestinationSeed[] = [
  {
    id: 'marokko',
    content: {
      name: 'Südmarokko',
      region: 'Mirleft & Anti-Atlas',
      mapQuery: 'Mirleft, Marokko',
      coords: { lat: 29.586, lng: -10.036 },
      tagline: '4x4-Roadtrip mit Dachzelt',
      summary:
        'Wilder Atlantik trifft auf die ockerfarbenen Granitberge des Anti-Atlas. Ein autarkes Basislager auf vier Rädern, jeden Abend woanders.',
      flight: {
        airportCode: 'AGA',
        airportName: 'Agadir',
        airportMapQuery: 'Agadir Al Massira Airport',
        duration: '~4,5 h',
        stops: 0,
        airlineExamples: 'easyJet, Ryanair',
      },
      climate: { air: '24–27 °C', water: '~20 °C' },
      activities: [
        {
          id: 'surfen',
          name: 'Surfen',
          location: 'Mirleft & Sidi Ifni (z. B. Playa de Legzira)',
          description:
            'Konstante Atlantik-Dünung an leeren Sandbänken und Riffen, dazu die roten Felsbögen von Legzira.',
          places: [
            { name: 'Mirleft', mapQuery: 'Mirleft, Marokko' },
            { name: 'Sidi Ifni', mapQuery: 'Sidi Ifni, Marokko' },
            { name: 'Playa de Legzira', mapQuery: 'Plage Legzira' },
          ],
        },
        {
          id: 'wandern-bouldern',
          name: 'Wandern & Bouldern',
          location: 'Tafraoute-Hochtal (Painted Rocks)',
          description:
            'Runde Granitriesen, ein Teil davon blau bemalt, und Pfade durch das Ammeln-Tal am Fuß des Anti-Atlas.',
          places: [
            { name: 'Tafraoute', mapQuery: 'Tafraoute, Marokko' },
            { name: 'Painted Rocks', mapQuery: 'Painted Rocks Tafraoute' },
            { name: 'Ammeln-Tal', mapQuery: 'Ameln Valley, Tafraoute' },
          ],
        },
        {
          id: 'offroad',
          name: 'Offroad-Fahren',
          location: 'Anti-Atlas-Gebirge',
          description:
            "Schotterpässe, die Palmenoase der Gorges d'Aït Mansour und Pisten entlang der Klippen, alles mit dem eigenen 4x4.",
          places: [
            { name: 'Anti-Atlas', mapQuery: 'Anti-Atlas, Marokko' },
            { name: "Gorges d'Aït Mansour", mapQuery: "Gorges d'Aït Mansour" },
          ],
        },
      ],
      logistics: {
        vehicle: '4x4 mit Dachzelt ab Flughafen Agadir',
        lodging: 'Dachzelt (Camping) oder lokale Riads, Kasbahs und Airbnbs',
      },
      limitation:
        'Reine Camping-Infrastruktur bei Dachzelt-Nutzung; nachts im Gebirge kühl (10–14 °C).',
      theme: {
        surface: '#FAF1EA',
        surfaceElevated: '#FFFFFF',
        accent: '#C2593F',
        accentStrong: '#8F3A26',
        accentSoft: '#F6DED3',
        ink: '#2A1612',
        inkMuted: '#86655A',
        sceneSky: '#FFD9BF',
        sceneGround: '#D9884F',
        sceneWater: '#2F7FA6',
      },
    },
    itinerary: [
      {
        date: '2026-11-06',
        title: 'Abflug BER am Abend',
        note: 'Nacht in Tamraght (Riad)',
        mapQuery: 'Tamraght, Marokko',
      },
      {
        date: '2026-11-07',
        title: '4x4 übernehmen, Küste nach Süden',
        note: 'Mirleft, erste Nacht im Dachzelt',
        mapQuery: 'Mirleft, Marokko',
      },
      {
        date: '2026-11-08',
        title: 'Surfen in Mirleft',
        note: 'Sonnenuntergang an den Felsbögen von Legzira',
        mapQuery: 'Plage Legzira',
      },
      {
        date: '2026-11-09',
        title: 'Surfen in Sidi Ifni',
        note: 'Küstenpisten',
        mapQuery: 'Sidi Ifni, Marokko',
      },
      {
        date: '2026-11-10',
        title: 'Ins Landesinnere nach Tafraoute',
        note: 'Painted Rocks am Abend',
        mapQuery: 'Tafraoute, Marokko',
      },
      {
        date: '2026-11-11',
        title: 'Wandern & Bouldern',
        note: 'Ammeln-Tal, Tafraoute-Hochtal',
        mapQuery: 'Ameln Valley, Tafraoute',
      },
      {
        date: '2026-11-12',
        title: "Gorges d'Aït Mansour",
        note: 'Palmenoase, Offroad-Tag',
        mapQuery: "Gorges d'Aït Mansour",
      },
      {
        date: '2026-11-13',
        title: 'Zurück an die Küste',
        note: 'Surf-Tag in Taghazout oder Imsouane',
        mapQuery: 'Taghazout, Marokko',
      },
      {
        date: '2026-11-14',
        title: 'Paradise Valley oder Surfen',
        note: 'Abend in Agadir',
        mapQuery: 'Paradise Valley, Agadir',
      },
      { date: '2026-11-15', title: 'Rückflug', note: null, mapQuery: 'Agadir Al Massira Airport' },
    ],
    packing: [
      { label: 'Reisepass', kind: 'dokument', note: 'visafrei', done: false },
      {
        label: 'Internationaler Führerschein',
        kind: 'dokument',
        note: 'empfohlen für den 4x4',
        done: false,
      },
      {
        label: '4x4-Buchung mit Dachzelt und Kochset bestätigen',
        kind: 'dokument',
        note: null,
        done: false,
      },
      {
        label: 'Neoprenanzug 3/2',
        kind: 'ausruestung',
        note: 'Wasser ~20 °C, vor Ort leihbar',
        done: false,
      },
      { label: 'Surfboard leihen', kind: 'ausruestung', note: null, done: false },
      {
        label: 'Warmer Schlafsack',
        kind: 'ausruestung',
        note: 'Gebirgsnächte 10–14 °C',
        done: false,
      },
      { label: 'Stirnlampe', kind: 'ausruestung', note: null, done: false },
      { label: 'Bargeld in Dirham', kind: 'geld', note: 'Abhebung in Agadir', done: false },
      { label: 'SIM-Karte am Flughafen', kind: 'sonstiges', note: null, done: false },
      { label: 'Sonnenschutz', kind: 'sonstiges', note: null, done: false },
    ],
  },
  {
    id: 'kapverden',
    content: {
      name: 'Kapverden',
      region: 'São Vicente & Santo Antão',
      mapQuery: 'Santo Antão, Cabo Verde',
      coords: { lat: 17.2, lng: -25.09 },
      tagline: 'Steilwände, Passatwind & Morna',
      summary:
        'Santo Antão fällt 1.500 Meter fast senkrecht in den Atlantik, drüben in Mindelo spielt abends Live-Musik. Hawaii trifft Westafrika.',
      flight: {
        airportCode: 'VXE',
        airportName: 'São Vicente',
        airportMapQuery: 'Cesária Évora International Airport',
        duration: '~8–10 h',
        stops: 1,
        via: 'Lissabon',
        extraTransfer: '+ 1 h Fähre',
        airlineExamples: 'TAP Air Portugal',
      },
      climate: { air: '27–29 °C', water: '~25 °C' },
      activities: [
        {
          id: 'steilkueste',
          name: 'Steilküstenwandern',
          location: 'Santo Antão (Ponta do Sol nach Cruzinha)',
          description:
            'Ein in die Basaltwand gehauener Küstenpfad, hundert Meter über der tosenden Brandung.',
          places: [
            { name: 'Ponta do Sol', mapQuery: 'Ponta do Sol, Santo Antão' },
            { name: 'Cruzinha', mapQuery: 'Cruzinha da Garça, Santo Antão' },
          ],
        },
        {
          id: 'bergwandern-canyoning',
          name: 'Bergwandern & Canyoning',
          location: 'Santo Antão (Paul-Tal)',
          description:
            'Terrassen mit Zuckerrohr, Kaffee und Mango, darüber Nebelgipfel und Wasserfälle zum Abseilen.',
          places: [
            { name: 'Paul-Tal', mapQuery: 'Vale do Paul, Santo Antão' },
            { name: 'Cova-Krater', mapQuery: 'Cova de Paúl, Santo Antão' },
          ],
        },
        {
          id: 'kitesurfen',
          name: 'Kitesurfen',
          location: 'São Vicente (Bucht von Salamansa)',
          description:
            'Verlässlicher Passatwind über türkisfarbenem Wasser und kaum jemand im Line-up.',
          places: [{ name: 'Salamansa', mapQuery: 'Salamansa, São Vicente' }],
        },
        {
          id: 'surfen',
          name: 'Surfen',
          location: 'Santo Antão (ausgewählte Riffbreaks)',
          description:
            'Kraftvolle Riffwellen an abgelegenen Buchten, eher etwas für geübte Surfer.',
          places: [{ name: 'Santo Antão', mapQuery: 'Santo Antão, Cabo Verde' }],
        },
      ],
      logistics: {
        vehicle: 'Taxis und Mietwagen vor Ort, Fähre Mindelo–Porto Novo',
        lodging: 'Residências, traditionelle Steinhäuser oder private Airbnbs',
      },
      limitation:
        'Lange Reisezeit inkl. Inselfähre; beansprucht bei 7 Tagen Urlaub zwei Tage für Transfers.',
      theme: {
        surface: '#EEF7F5',
        surfaceElevated: '#FFFFFF',
        accent: '#0E7490',
        accentStrong: '#0B5563',
        accentSoft: '#D4ECEA',
        ink: '#0F2A2E',
        inkMuted: '#5B7A7E',
        sceneSky: '#D6F1F4',
        sceneGround: '#3F6B4A',
        sceneWater: '#1FA3A8',
      },
    },
    itinerary: [
      {
        date: '2026-11-06',
        title: 'Abflug BER nach Lissabon',
        note: 'Nacht in Lissabon oder Nachtflug',
        mapQuery: 'Lisbon Airport',
      },
      {
        date: '2026-11-07',
        title: 'Lissabon → São Vicente',
        note: 'Mindelo, abends Live-Musik',
        mapQuery: 'Mindelo, São Vicente',
      },
      {
        date: '2026-11-08',
        title: 'Fähre nach Porto Novo',
        note: 'Lodge im Paul-Tal',
        mapQuery: 'Porto Novo, Santo Antão',
      },
      {
        date: '2026-11-09',
        title: 'Wanderung Cova-Krater → Paul-Tal',
        note: null,
        mapQuery: 'Cova de Paúl, Santo Antão',
      },
      {
        date: '2026-11-10',
        title: 'Küstenpfad Ponta do Sol → Cruzinha',
        note: null,
        mapQuery: 'Ponta do Sol, Santo Antão',
      },
      {
        date: '2026-11-11',
        title: 'Canyoning',
        note: 'Ribeira da Torre oder Ribeira Grande',
        mapQuery: 'Ribeira Grande, Santo Antão',
      },
      {
        date: '2026-11-12',
        title: 'Fähre zurück, Salamansa',
        note: 'Kiten oder Surfen',
        mapQuery: 'Salamansa, São Vicente',
      },
      {
        date: '2026-11-13',
        title: 'São Vicente',
        note: 'Monte Verde, Baía das Gatas, Surfen',
        mapQuery: 'Baía das Gatas, São Vicente',
      },
      {
        date: '2026-11-14',
        title: 'Puffer in Mindelo',
        note: 'abends Flug nach Lissabon',
        mapQuery: 'Mindelo, São Vicente',
      },
      { date: '2026-11-15', title: 'Lissabon → Berlin', note: null, mapQuery: 'Lisbon Airport' },
    ],
    packing: [
      { label: 'Reisepass', kind: 'dokument', note: null, done: false },
      {
        label: 'EASE-Online-Registrierung',
        kind: 'dokument',
        note: 'plus Flughafengebühr, vorher prüfen',
        done: false,
      },
      {
        label: 'Fährfahrplan Mindelo–Porto Novo prüfen',
        kind: 'dokument',
        note: null,
        done: false,
      },
      { label: 'Wanderschuhe mit Profil', kind: 'ausruestung', note: null, done: false },
      { label: 'Trekkingstöcke', kind: 'ausruestung', note: null, done: false },
      {
        label: 'Kite-Equipment leihen',
        kind: 'ausruestung',
        note: 'Mindelo oder Salamansa',
        done: false,
      },
      { label: 'Leichter Regenschutz', kind: 'ausruestung', note: null, done: false },
      { label: 'Bargeld in Escudo', kind: 'geld', note: 'Euro wird oft akzeptiert', done: false },
      { label: 'Powerbank', kind: 'sonstiges', note: null, done: false },
      { label: 'Sonnenschutz', kind: 'sonstiges', note: null, done: false },
    ],
  },
  {
    id: 'oman',
    content: {
      name: 'Oman',
      region: 'Maskat, Wadis & Wahiba Sands',
      mapQuery: 'Wadi Shab, Oman',
      coords: { lat: 23.588, lng: 58.383 },
      tagline: 'Wadis, Dünen & smaragdgrüne Pools',
      summary:
        'Türkisfarbene Kalksteinschluchten, Wüstencamps unter klarem Sternenhimmel und ein Canyon, der 1.000 Meter in die Tiefe fällt.',
      flight: {
        airportCode: 'MCT',
        airportName: 'Maskat',
        airportMapQuery: 'Muscat International Airport',
        duration: '~7–8 h',
        stops: 1,
        via: 'Doha oder Istanbul',
        airlineExamples: 'Qatar Airways, Turkish Airlines',
      },
      climate: { air: '28–30 °C', water: '~26 °C' },
      activities: [
        {
          id: 'canyoning-klippenspringen',
          name: 'Canyoning & Klippenspringen',
          location: 'Wadi Shab & Wadi Tiwi',
          description:
            'Durch türkisfarbene Kalksteinschluchten schwimmen und von Felskanten in tiefe Süßwasserpools springen.',
          places: [
            { name: 'Wadi Shab', mapQuery: 'Wadi Shab, Oman' },
            { name: 'Wadi Tiwi', mapQuery: 'Wadi Tiwi, Oman' },
          ],
        },
        {
          id: 'hoehenwandern',
          name: 'Höhenwandern',
          location: 'Jebel Shams (Balcony Walk)',
          description:
            'Ein Felsband entlang einer 1.000 Meter tiefen Wand, am Ende ein verlassenes Steindorf.',
          places: [{ name: 'Jebel Shams Balcony Walk', mapQuery: 'Jebel Shams Balcony Walk' }],
        },
        {
          id: 'tauchen',
          name: 'Wrack- & Rifftauchen',
          location: 'Daymaniyat-Inseln',
          description:
            'Geschütztes Riff mit Meeresschildkröten und Rochen, das Wasser hat badewannenwarme 26 Grad.',
          places: [{ name: 'Daymaniyat-Inseln', mapQuery: 'Daymaniyat Islands' }],
        },
      ],
      logistics: {
        vehicle: '4x4-Mietwagen für Wüstenpisten und Gebirge',
        lodging: 'Wüstencamps, Oasen-Guesthouses, Airbnbs in Maskat oder Wildcamping',
      },
      limitation: 'Kein Surfen möglich; höhere Gesamtkosten für Geländewagen und Flüge.',
      theme: {
        surface: '#FBF6EC',
        surfaceElevated: '#FFFFFF',
        accent: '#D97706',
        accentStrong: '#9A4F05',
        accentSoft: '#FCEBC9',
        ink: '#2A1E0C',
        inkMuted: '#8A6F4D',
        sceneSky: '#FFE8B8',
        sceneGround: '#D9A05B',
        sceneWater: '#1E9E8C',
      },
    },
    itinerary: [
      {
        date: '2026-11-06',
        title: 'Abflug BER am Abend',
        note: 'Nachtflug via Doha oder Istanbul',
        mapQuery: null,
      },
      {
        date: '2026-11-07',
        title: 'Ankunft Maskat, 4x4 übernehmen',
        note: 'Muttrah, Nacht in Maskat',
        mapQuery: 'Muttrah Corniche, Muscat',
      },
      {
        date: '2026-11-08',
        title: 'Daymaniyat-Inseln',
        note: 'Tauchen oder Schnorcheln, Boot ab Al Mouj',
        mapQuery: 'Daymaniyat Islands',
      },
      {
        date: '2026-11-09',
        title: 'Küste nach Süden',
        note: 'Bimmah Sinkhole, Wadi Shab, Nacht in Tiwi oder Sur',
        mapQuery: 'Bimmah Sinkhole',
      },
      {
        date: '2026-11-10',
        title: 'Wadi Tiwi & Sur',
        note: 'abends Schildkröten in Ras al Jinz',
        mapQuery: 'Ras Al Jinz Turtle Reserve',
      },
      {
        date: '2026-11-11',
        title: 'Wahiba Sands',
        note: 'Wüstencamp, Dünen',
        mapQuery: 'Wahiba Sands',
      },
      {
        date: '2026-11-12',
        title: 'Wadi Bani Khalid',
        note: 'Fahrt nach Nizwa',
        mapQuery: 'Wadi Bani Khalid',
      },
      {
        date: '2026-11-13',
        title: 'Jebel Shams Balcony Walk',
        note: 'Nacht am Jebel Shams',
        mapQuery: 'Jebel Shams Balcony Walk',
      },
      {
        date: '2026-11-14',
        title: 'Misfat al Abriyeen & Nizwa Fort',
        note: 'zurück nach Maskat',
        mapQuery: 'Misfat Al Abriyeen',
      },
      {
        date: '2026-11-15',
        title: 'Rückflug',
        note: null,
        mapQuery: 'Muscat International Airport',
      },
    ],
    packing: [
      { label: 'Reisepass', kind: 'dokument', note: null, done: false },
      {
        label: 'Visum-Regel prüfen',
        kind: 'dokument',
        note: 'kurze Aufenthalte derzeit visafrei, sonst eVisa',
        done: false,
      },
      { label: 'Internationaler Führerschein', kind: 'dokument', note: null, done: false },
      { label: '4x4 mit Offroad-Versicherung buchen', kind: 'dokument', note: null, done: false },
      {
        label: 'Wasserschuhe und Dry Bag',
        kind: 'ausruestung',
        note: 'für die Wadis',
        done: false,
      },
      { label: 'Schnorchelmaske', kind: 'ausruestung', note: null, done: false },
      { label: 'Tauchschein', kind: 'dokument', note: 'für die Daymaniyat-Inseln', done: false },
      { label: 'Leichte lange Kleidung', kind: 'ausruestung', note: null, done: false },
      {
        label: 'Warme Schicht für Jebel Shams',
        kind: 'ausruestung',
        note: 'rund 2.000 m, nachts kühl',
        done: false,
      },
      { label: 'Stirnlampe', kind: 'ausruestung', note: null, done: false },
      { label: 'Bargeld in Rial', kind: 'geld', note: null, done: false },
      { label: 'SIM-Karte', kind: 'sonstiges', note: 'Omantel oder Ooredoo', done: false },
    ],
  },
];
