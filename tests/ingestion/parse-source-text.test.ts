import {beforeEach,describe,expect,it,vi} from "vitest";
import {readZipEntry} from "../../src/pipeline/ingestion/simple-zip.js";
import {parseSourceHeadings,parseSourceText,parseSourceTextByVerse} from "../../src/pipeline/ingestion/parse-source-text.js";

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
