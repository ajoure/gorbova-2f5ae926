import { Document, Paragraph, TextRun, AlignmentType, Packer, convertInchesToTwip } from "docx";
import { saveAs } from "file-saver";

// Create response paragraphs with proper formatting
function createResponseParagraphs(content: string): Paragraph[] {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Detect special lines
    const isHeader = trimmedLine.startsWith("О рассмотрении") ||
                     trimmedLine === "С уважением,";
    
    const isRightAligned = trimmedLine.startsWith("В ___") ||
                           trimmedLine.startsWith("Исх. №") ||
                           trimmedLine.startsWith("от «") ||
                           trimmedLine.match(/^\(должность\)/) ||
                           trimmedLine.match(/^\(Ф\.И\.О\.\)/);
    
    const isSignature = trimmedLine.startsWith("(должность)") ||
                        trimmedLine.startsWith("(Ф.И.О.)") ||
                        trimmedLine === "С уважением,";
    
    const isEmpty = trimmedLine === "";
    
    // Determine alignment: body text = JUSTIFIED, special lines = different
    let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.JUSTIFIED;
    if (isRightAligned) alignment = AlignmentType.RIGHT;
    else if (isHeader) alignment = AlignmentType.LEFT;
    else if (isSignature) alignment = AlignmentType.LEFT;
    else if (isEmpty) alignment = AlignmentType.LEFT;
    
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            bold: isHeader,
            size: 24, // 12pt
            font: "Times New Roman",
          }),
        ],
        alignment,
        spacing: {
          after: 120,
          line: 276, // 1.15 line spacing
        },
        indent: {
          firstLine: isEmpty || isRightAligned || isHeader || isSignature ? 0 : convertInchesToTwip(0.5),
        },
      })
    );
  }

  return paragraphs;
}

export async function exportToDocx(
  content: string, 
  filename: string = "response.docx"
) {
  const children = createResponseParagraphs(content);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // 2cm
              right: 850, // ~1.5cm
              bottom: 1134, // 2cm
              left: 1701, // ~3cm
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}

export async function exportToPdf(
  content: string, 
  filename: string = "response.pdf"
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Не удалось открыть окно для печати. Разрешите всплывающие окна.");
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${filename}</title>
      <style>
        @page {
          size: A4;
          margin: 2cm 1.5cm 2cm 3cm;
        }
        body {
          font-family: "Times New Roman", Times, serif;
          font-size: 12pt;
          line-height: 1.15;
          text-align: justify;
        }
        p {
          text-indent: 1.25cm;
          margin: 0 0 6pt 0;
        }
        .no-indent {
          text-indent: 0;
        }
        .right-align {
          text-align: right;
        }
        .signature {
          text-indent: 0;
          margin-top: 20pt;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      </style>
    </head>
    <body>
      <div style="white-space: pre-wrap; word-wrap: break-word;">
${content}
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  printWindow.onload = () => {
    printWindow.print();
  };
}
