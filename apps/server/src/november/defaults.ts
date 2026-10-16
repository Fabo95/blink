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
    id: 'azoren',
    content: {
      name: 'Azoren',
      region: 'São Miguel',
      mapQuery: 'São Miguel, Azoren',
      coords: { lat: 37.8, lng: -25.6 },
      tagline: 'Krater, Küste & heiße Quellen',
      summary:
        'Vulkanische Kraterseen, dunkle Lavastrände und heiße Quellen mitten im Grün. Rau, ruhig und im November echtes Herbstwetter.',
      flight: {
        airportCode: 'PDL',
        airportName: 'Ponta Delgada',
        airportMapQuery: 'João Paulo II Airport, Ponta Delgada',
        duration: '~6–8 h',
        stops: 1,
        via: 'Lissabon',
        airlineExamples: 'TAP Air Portugal, Azores Airlines',
      },
      climate: { air: '17–20 °C', water: '~19 °C' },
      activities: [
        {
          id: 'surfen',
          name: 'Surfen',
          location: 'Dunkle Vulkanstrände (z. B. Praia de Santa Bárbara)',
          description:
            'Atlantik-Swell an schwarzen Sandstränden der Nordküste, Surfschulen und Boardverleih direkt am Strand.',
          places: [
            { name: 'Praia de Santa Bárbara', mapQuery: 'Praia de Santa Bárbara, Ribeira Grande' },
            { name: 'Ribeira Grande', mapQuery: 'Ribeira Grande, São Miguel' },
          ],
        },
        {
          id: 'krater-wandern-biken',
          name: 'Krater-Wandern & Mountainbiken',
          location: 'Sete Cidades',
          description:
            'Rund um den Kraterrand mit Blick auf den grünen und den blauen See, zu Fuß oder mit dem Rad.',
          places: [
            { name: 'Sete Cidades', mapQuery: 'Sete Cidades, São Miguel' },
            { name: 'Vista do Rei', mapQuery: 'Miradouro da Vista do Rei' },
            { name: 'Lagoa do Fogo', mapQuery: 'Lagoa do Fogo' },
          ],
        },
        {
          id: 'heisse-quellen',
          name: 'Heiße Quellen',
          location: 'Furnas',
          description:
            'Baden in vulkanisch warmen Pools mitten im Dschungel, dazu Cozido aus dem Erdofen.',
          places: [
            { name: 'Furnas', mapQuery: 'Furnas, São Miguel' },
            { name: 'Poça da Dona Beija', mapQuery: 'Poça da Dona Beija' },
            { name: 'Terra Nostra Park', mapQuery: 'Parque Terra Nostra' },
          ],
        },
      ],
      logistics: {
        vehicle: 'Standard-Mietwagen zwingend erforderlich',
        lodging: 'Surf-Lodges, Pousadas und Airbnbs',
      },
      limitation:
        'Wetterrisiko: Im November ist dort echter Herbst (kühl, feucht, regnerisch). Verfehlt das „Warm“-Kriterium.',
      theme: {
        surface: '#F2F5EE',
        surfaceElevated: '#FFFFFF',
        accent: '#5A8F3D',
        accentStrong: '#3B6428',
        accentSoft: '#DFEBD2',
        ink: '#1B2616',
        inkMuted: '#667560',
        sceneSky: '#D9E3E6',
        sceneGround: '#6FA05A',
        sceneWater: '#4A90B8',
      },
    },
    itinerary: [
      {
        date: '2026-11-06',
        title: 'Abflug BER nach Lissabon',
        note: 'Anschluss nach Ponta Delgada oder Nacht in Lissabon',
        mapQuery: 'Lisbon Airport',
      },
      {
        date: '2026-11-07',
        title: 'Ankunft Ponta Delgada, Mietwagen',
        note: 'Altstadt, erster Blick auf die Küste',
        mapQuery: 'Ponta Delgada',
      },
      {
        date: '2026-11-08',
        title: 'Sete Cidades Kraterrand',
        note: 'Vista do Rei, Wanderung oder Mountainbike',
        mapQuery: 'Miradouro da Vista do Rei',
      },
      {
        date: '2026-11-09',
        title: 'Surfen in Santa Bárbara',
        note: 'Ribeira Grande, Surfschule am Strand',
        mapQuery: 'Praia de Santa Bárbara, Ribeira Grande',
      },
      {
        date: '2026-11-10',
        title: 'Lagoa do Fogo',
        note: 'Wanderung zum Kratersee, Caldeira Velha',
        mapQuery: 'Lagoa do Fogo',
      },
      {
        date: '2026-11-11',
        title: 'Furnas',
        note: 'Heiße Quellen, Terra Nostra Park, Cozido',
        mapQuery: 'Furnas, São Miguel',
      },
      {
        date: '2026-11-12',
        title: 'Nordeste & Ostküste',
        note: 'Wasserfälle und Aussichtspunkte',
        mapQuery: 'Nordeste, São Miguel',
      },
      {
        date: '2026-11-13',
        title: 'Surfen oder Walbeobachtung',
        note: 'je nach Wetter, Boot ab Ponta Delgada',
        mapQuery: 'Ponta Delgada',
      },
      {
        date: '2026-11-14',
        title: 'Mosteiros & Westküste',
        note: 'Lavapools, Sonnenuntergang',
        mapQuery: 'Mosteiros, São Miguel',
      },
      {
        date: '2026-11-15',
        title: 'Rückflug via Lissabon',
        note: null,
        mapQuery: 'João Paulo II Airport, Ponta Delgada',
      },
    ],
    packing: [
      {
        label: 'Personalausweis',
        kind: 'dokument',
        note: 'EU, Reisepass nicht nötig',
        done: false,
      },
      {
        label: 'Mietwagen buchen',
        kind: 'dokument',
        note: 'zwingend, Automatik früh reservieren',
        done: false,
      },
      { label: 'Regenjacke', kind: 'ausruestung', note: 'November ist Herbst', done: false },
      { label: 'Wanderschuhe mit Profil', kind: 'ausruestung', note: null, done: false },
      {
        label: 'Neoprenanzug 4/3',
        kind: 'ausruestung',
        note: 'Wasser ~19 °C, vor Ort leihbar',
        done: false,
      },
      {
        label: 'Badesachen und altes Handtuch',
        kind: 'ausruestung',
        note: 'das Eisenwasser in Furnas färbt',
        done: false,
      },
      { label: 'Warme Schichten für Wind', kind: 'ausruestung', note: null, done: false },
      { label: 'Stirnlampe', kind: 'ausruestung', note: null, done: false },
      { label: 'Bargeld in Euro', kind: 'geld', note: 'Karte fast überall', done: false },
      { label: 'Fernglas', kind: 'sonstiges', note: 'für Wale und Delfine', done: false },
    ],
  },
];
