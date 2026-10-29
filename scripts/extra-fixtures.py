"""Optional QA fixtures; requires reportlab and pypdf, not needed by the app."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pypdf import PdfReader, PdfWriter

out = Path(__file__).resolve().parents[1] / 'qa' / 'fixtures'
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
c = canvas.Canvas(str(out / 'chinese-paper.pdf'), pagesize=(595, 842))
c.setTitle('中文章节识别测试')
chapters = [('摘要', '第一章绪论'), ('第二章研究方法', '2.1 数据处理'), ('第三章结果与讨论', '参考文献')]
for titles in chapters:
    for title, y in zip(titles, [740, 450]):
        c.setFont('STSong-Light', 16)
        c.drawString(46, y, title)
        c.setFont('STSong-Light', 10)
        for i in range(10):
            c.drawString(46, y - 28 - i * 17, '本文采用固定实验流程进行对比分析，说明研究方法与结果的适用范围。')
    c.showPage()
c.save()
writer = PdfWriter(clone_from=str(out / 'demo-paper.pdf'))
writer.encrypt('test-password')
writer.write(str(out / 'encrypted.pdf'))
print('Created Chinese and encrypted QA fixtures.')
