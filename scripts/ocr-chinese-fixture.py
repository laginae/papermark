"""Optional image-only Chinese test PDF. Requires Pillow, reportlab and a CJK font."""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

root = Path(__file__).resolve().parents[1] / 'qa' / 'fixtures'
root.mkdir(parents=True, exist_ok=True)
fonts = [Path(os.environ.get('WINDIR', '')) / 'Fonts' / 'simsun.ttc',
         Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')]
font = next((p for p in fonts if p.is_file()), None)
if font is None:
    raise SystemExit('Install a CJK font or edit the test font candidate list.')
pdf = canvas.Canvas(str(root / 'scanned-chinese.pdf'), pagesize=(595, 842))
pdf.setTitle('Synthetic Chinese scan'); pdf.setAuthor('PaperMark test fixture')
for titles in [('摘要', '第一章绪论'), ('第二章研究方法', '2.1 数据处理')]:
    image = Image.new('RGB', (1190, 1684), 'white'); draw = ImageDraw.Draw(image)
    for title, top in zip(titles, [160, 820]):
        draw.text((92, top), title, font=ImageFont.truetype(str(font), 38), fill='black')
        for i in range(10):
            draw.text((92, top+70+i*34), '本文采用固定实验流程进行比较，说明研究方法和结果的适用范围。',
                      font=ImageFont.truetype(str(font), 23), fill='black')
    pdf.drawImage(ImageReader(image), 0, 0, width=595, height=842)
    if titles[0] == '摘要': image.save(root / 'scanned-chinese-preview.png')
    pdf.showPage()
pdf.save()
print('Created two image-only Chinese pages.')
