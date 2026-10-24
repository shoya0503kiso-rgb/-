import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// フォントは assets/fonts/ に同梱（オフラインでも書き出せるように）
loadFont({ family: "Dela Gothic One", url: staticFile("fonts/DelaGothicOne-Regular.ttf"), weight: "400" });
loadFont({ family: "Cinzel", url: staticFile("fonts/Cinzel-Black.ttf"), weight: "900" });
loadFont({ family: "Oswald", url: staticFile("fonts/Oswald-Bold.ttf"), weight: "700" });
