import sharp from "sharp";

async function run() {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const inputJson = JSON.parse(Buffer.concat(chunks).toString());

    const { svg, width, height, isIcon, color, bgHex, fit } = inputJson;

    let processedSvg = svg;
    if (isIcon) {
      processedSvg = svg.replaceAll("currentColor", color || "white");
    }

    const sharpInstance = sharp(Buffer.from(processedSvg))
      .resize(width, height, { kernel: "lanczos3", fit: fit || "fill" })
      .sharpen();

    const finalInstance = bgHex ? sharpInstance.flatten({ background: bgHex }) : sharpInstance;

    const { data, info } = await finalInstance
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pngBuffer = await finalInstance.png().toBuffer();

    const output = {
      pngBase64: pngBuffer.toString("base64"),
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
