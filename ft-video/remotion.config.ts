import { Config } from "@remotion/cli/config";

// 素材は assets/ に置く（staticFile("videos/player1.mp4") のように参照される）
Config.setPublicDir("./assets");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(18);
