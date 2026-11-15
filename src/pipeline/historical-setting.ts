/** Small, scoped production decisions. Evidence stays linked, not replayed. */
export const DOORWAY_RULE = "DOORWAYS: whenever a door is visible, use plain plank leaves on wooden pivot pegs seated in stone threshold sockets. Ordinary homes use one smaller leaf; public buildings may have two heavier leaves. Capernaum thresholds/jambs use dark basalt; Jerusalem uses local limestone. Temple doors need their own source-specific reference, never an inferred synagogue design. never modern butt hinges, lever handles, decorative hardware or tidy modern trim. No modern paneled doors. This is a production reconstruction, not an exact archaeological elevation.";

export function historicalSettingDecisions(project: {book:string;chapter:number}, sceneSequences: readonly number[]) {
  const decisions = [{id:"doorway-pivot-planks",version:1,scope:"visible first-century doorways",rule:DOORWAY_RULE,
    evidence:["docs/design/media-generation.md#shared-doorway-construction-rule","https://nazarethvillage.com/about/research-and-archaeology/the-synagogue/entrance/"]}];
  if(project.book.toLowerCase()==="mark"&&project.chapter===6&&sceneSequences.includes(1))decisions.push({
    id:"mark6-hometown-synagogue",version:2,scope:"Mark 6 scene 1 only; conventional Nazareth identification",
    rule:"Nazareth hometown synagogue reconstruction, not Capernaum or the Jerusalem Temple. Modest local rough limestone is plausible; do not transplant Capernaum's dark-basalt treatment or its much later ornate white-limestone synagogue. Use restrained plain columns, stone perimeter benches and simple heavy timber roof framing; hidden roof covering is unspecified, not a claimed reed/earth layer. Exact Nazareth building geometry is unknown. Decorative diamond window grids/glazing have no supplied support: use simple unglazed light openings in this reconstruction. Preserve approved people/action; previous scene pictures do not authorize unsupported architecture.",
    evidence:["docs/production/CAPERNAUM_SYNAGOGUE_EXTERIOR.md","https://nazarethvillage.com/about/research-and-archaeology/the-synagogue/exterior-stone-construction/","https://nazarethvillage.com/about/research-and-archaeology/the-synagogue/first-century-synagogues/"]});
  return decisions;
}

export function historicalSettingPrompt(project:{book:string;chapter:number},sceneSequences:readonly number[]) {
  return "\nCONTROLLING SCOPED HISTORICAL DECISIONS (versioned production reconstruction; never infer unseen archaeology):\n"+
    historicalSettingDecisions(project,sceneSequences).map(d=>`${d.id}@${d.version} [${d.scope}]: ${d.rule}\nEvidence: ${d.evidence.join("; ")}`).join("\n");
}
