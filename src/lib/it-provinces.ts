// Sigla della provincia italiana a partire dal nome che restituisce OpenStreetMap (campo "county").
// OSM scrive a volte "Città Metropolitana di Torino", "Provincia di X" o "Roma Capitale": si normalizza.

const PROVINCES: Record<string, string> = {
  agrigento: "AG", alessandria: "AL", ancona: "AN", aosta: "AO", arezzo: "AR", "ascoli piceno": "AP", asti: "AT",
  avellino: "AV", bari: "BA", "barletta-andria-trani": "BT", belluno: "BL", benevento: "BN", bergamo: "BG", biella: "BI",
  bologna: "BO", bolzano: "BZ", brescia: "BS", brindisi: "BR", cagliari: "CA", caltanissetta: "CL", campobasso: "CB",
  caserta: "CE", catania: "CT", catanzaro: "CZ", chieti: "CH", como: "CO", cosenza: "CS", cremona: "CR", crotone: "KR",
  cuneo: "CN", enna: "EN", fermo: "FM", ferrara: "FE", firenze: "FI", foggia: "FG", "forlì-cesena": "FC", frosinone: "FR",
  genova: "GE", gorizia: "GO", grosseto: "GR", imperia: "IM", isernia: "IS", "la spezia": "SP", "l'aquila": "AQ", latina: "LT",
  lecce: "LE", lecco: "LC", livorno: "LI", lodi: "LO", lucca: "LU", macerata: "MC", mantova: "MN", "massa-carrara": "MS",
  matera: "MT", messina: "ME", milano: "MI", modena: "MO", "monza e della brianza": "MB", napoli: "NA", novara: "NO",
  nuoro: "NU", oristano: "OR", padova: "PD", palermo: "PA", parma: "PR", pavia: "PV", perugia: "PG",
  "pesaro e urbino": "PU", pescara: "PE", piacenza: "PC", pisa: "PI", pistoia: "PT", pordenone: "PN", potenza: "PZ",
  prato: "PO", ragusa: "RG", ravenna: "RA", "reggio calabria": "RC", "reggio emilia": "RE", rieti: "RI", rimini: "RN",
  roma: "RM", rovigo: "RO", salerno: "SA", sassari: "SS", savona: "SV", siena: "SI", siracusa: "SR", sondrio: "SO",
  "sud sardegna": "SU", taranto: "TA", teramo: "TE", terni: "TR", torino: "TO", trapani: "TP", trento: "TN", treviso: "TV",
  trieste: "TS", udine: "UD", varese: "VA", venezia: "VE", "verbano-cusio-ossola": "VB", vercelli: "VC", verona: "VR",
  "vibo valentia": "VV", vicenza: "VI", viterbo: "VT",
};

export function provinceCode(county: string | null | undefined): string | null {
  if (!county) return null;
  let s = county.toLowerCase().trim();
  s = s.replace(/^(città metropolitana|citta metropolitana|provincia autonoma|provincia)\s+(di|del|della|dell')\s*/i, "");
  s = s.replace(/\s+capitale$/, "").replace(/\/.*$/, "").replace(/\s*\(.*\)\s*$/, "").trim();
  if (s.startsWith("valle d'aosta")) return "AO";
  return PROVINCES[s] ?? null;
}
