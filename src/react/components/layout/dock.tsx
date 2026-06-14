import { presetBox } from "../factory.tsx";

/** Container that pins children to edges via their `dock` style (header/footer/body shell). */
export const Dock = presetBox({ display: "dock" }, "Dock");
