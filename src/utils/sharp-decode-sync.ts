import sharp from "sharp";

async function run() {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const inputJson = JSON.parse(Buffer.concat(chunks).toString());
    const input = Buffer.from(inputJson.bufferBase64, "base64");

    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const output = {
      pixelsBase64: Buffer.from(data).toString("base64"),
      width: info.width,
      height: info.height,
    };

    console.log(JSON.stringify({ success: true, data: output }));
  } catch (err: any) {
    console.log(JSON.stringify({ success: false, error: err.message }));
  }
  process.exit(0);
}

run();
