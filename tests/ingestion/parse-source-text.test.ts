import {beforeEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {sourceParagraphDecisions} from "../../src/pipeline/ingestion/source-paragraph-decisions.js";
import {readZipEntry} from "../../src/pipeline/ingestion/simple-zip.js";
import {auditSourceBodyCoverage,parseSourceHeadings,parseSourceText,parseSourceTextByVerse} from "../../src/pipeline/ingestion/parse-source-text.js";

vi.mock("../../src/pipeline/ingestion/simple-zip.js",()=>({readZipEntry:vi.fn()}));
function source(paragraphs:string[]){
  vi.mocked(readZipEntry).mockReturnValue(Buffer.from('<w:document>'+paragraphs.map(p=>'<w:p><w:r><w:t>'+p+'</w:t></w:r></w:p>').join('')+'</w:document>'));
}
beforeEach(()=>vi.clearAllMocks());
describe("source verse continuations",()=>{
  it("retains a reply before the next verse marker in the next paragraph",()=>{
    source(["MARKUS 5","A supplied heading","(Mat. 8:28-34)","9Lene Yesus hig ser noni “Anyeng tou i?”","No dima buhup “Dinyeng Nimpung Gom lewo nimang bibor!” 10Noni hara ser Yesus ninno."]);
    expect(parseSourceTextByVerse("fixture.docx")).toEqual([
      {verse:9,text:"Lene Yesus hig ser noni “Anyeng tou i?” No dima buhup “Dinyeng Nimpung Gom lewo nimang bibor!”",paragraphIndex:3,continuationParagraphIndices:[4]},
      {verse:10,text:"Noni hara ser Yesus ninno.",paragraphIndex:4}
    ]);
    expect(parseSourceHeadings("fixture.docx")).toEqual([{headingText:"A supplied heading",parallelRefs:"Mat. 8:28-34",verseStart:9}]);
    expect(parseSourceText("fixture.docx","mark",5).map(g=>g.text).join(" ")).toContain("No dima buhup “Dinyeng Nimpung Gom lewo nimang bibor!”");
  });
  it("does not attach section headings or an unrelated prefix across a verse gap",()=>{
    source(["MARKUS 5","1First supplied words.","A new heading","A preface 3Third supplied words."]);
    expect(parseSourceTextByVerse("fixture.docx").map(v=>v.text)).toEqual(["First supplied words.","Third supplied words."]);
  });
  it("keeps ordinary inline verse divisions and published reference lines unchanged",()=>{
    source(["MARKUS 5","Heading","(Mat. 8:28-34; Luk. 8:26-39)","1First supplied words. 2Second supplied words."]);
    expect(parseSourceTextByVerse("fixture.docx")).toEqual([{verse:1,text:"First supplied words.",paragraphIndex:3},{verse:2,text:"Second supplied words.",paragraphIndex:3}]);
  });
});


describe("complete body text accounting",()=>{
  it("retains the actual pinned English Mark6:6 continuation without changing the next verse",()=>{
    const xml=readFileSync(new URL("../fixtures/mark6-english-source-document.xml",import.meta.url));
    vi.mocked(readZipEntry).mockReturnValue(xml);
    const verses=parseSourceTextByVerse("fixture.docx");
    expect(verses).toHaveLength(56);
    expect(verses.find(v=>v.verse===6)).toEqual({verse:6,text:"And he marveled because of their unbelief. And he went about among the villages teaching.",paragraphIndex:2,continuationParagraphIndices:[3]});
    expect(verses.find(v=>v.verse===7)?.text).toBe("And he called the twelve and began to send them out two by two, and gave them authority over the unclean spirits.");
    expect(parseSourceText("fixture.docx","mark",6).map(v=>v.text).join(" ")).toContain("And he went about among the villages teaching.");
    expect(parseSourceHeadings("fixture.docx").some(h=>h.headingText.includes("went about"))).toBe(false);
  });
  it("does not inherit the inspected English paragraph decision after its XML changes",()=>{
    const xml=readFileSync(new URL("../fixtures/mark6-english-source-document.xml",import.meta.url),"utf8").replace("And he went about among the villages teaching.","Changed unreviewed prose.");
    expect(sourceParagraphDecisions(xml)).toBeUndefined();
    vi.mocked(readZipEntry).mockReturnValue(Buffer.from(xml));
    expect(parseSourceTextByVerse("fixture.docx").find(v=>v.verse===6)?.text).toBe("And he marveled because of their unbelief.");
  });
  it("detects lost unnumbered replies even when all numbered verses are present",()=>{
    source(["MARKUS 6","Heading","(Mat. 14:1-12)","15First speech.","Another supplied reply.","16Next speech."]);
    expect(parseSourceTextByVerse("fixture.docx").map(v=>v.verse)).toEqual([15,16]);
    expect(auditSourceBodyCoverage("fixture.docx",6).complete).toBe(false);
    const decisions={continuations:{4:15},prefixes:{},evidence:"Explicit fixture source structure"};
    expect(parseSourceTextByVerse("fixture.docx",decisions)[0]!.text).toBe("First speech. Another supplied reply.");
    expect(parseSourceHeadings("fixture.docx",decisions)).toEqual([{headingText:"Heading",parallelRefs:"Mat. 14:1-12",verseStart:15}]);
    expect(auditSourceBodyCoverage("fixture.docx",6,decisions).complete).toBe(true);
  });
  it("retains an evidenced prior-verse prefix across a published section title without attaching the title",()=>{
    source(["MARKUS 6","6First supplied words.","Heading","(Mat. 10:5-15)","Continuation of six. 7Next verse."]);
    expect(auditSourceBodyCoverage("fixture.docx",6).complete).toBe(false);
    const decisions={continuations:{},prefixes:{4:6},evidence:"Explicit fixture source structure"};
    expect(parseSourceTextByVerse("fixture.docx",decisions)[0]).toEqual({verse:6,text:"First supplied words. Continuation of six.",paragraphIndex:1,continuationParagraphIndices:[4]});
    expect(auditSourceBodyCoverage("fixture.docx",6,decisions).complete).toBe(true);
  });
  it("does not treat an ambiguous unpaired heading as permission to invent a continuation",()=>{
    source(["MARKUS 6","1First words.","Unpaired prose","2Second words."]);
    expect(auditSourceBodyCoverage("fixture.docx",6).complete).toBe(false);
    expect(parseSourceTextByVerse("fixture.docx")[0]!.text).toBe("First words.");
    expect(()=>parseSourceTextByVerse("fixture.docx",{continuations:{2:9},prefixes:{},evidence:"Stale fixture"})).toThrow("pinned verse");
  });
});
