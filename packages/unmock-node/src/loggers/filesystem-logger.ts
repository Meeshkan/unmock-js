import fs from "fs";
import path from "path";
import { ILogger } from "unmock-core";

const fileSizeLimitOnInit = 5 * 1024 ** 2; // 5 MB

export default class FSLogger implements ILogger {
  private targetFile: string;
  constructor({
    directory = "./",
    filename = "unmock.log",
  }: {
    directory?: string;
    filename?: string;
  }) {
    if (fs.existsSync(directory)) {
      this.targetFile = path.resolve(path.join(directory, filename));
    } else {
      const absPath = path.resolve(
        path.join(
          process.env.UNMOCK_SERVICES_DIRECTORY || process.cwd(),
          directory,
        ),
      );
      fs.mkdirSync(absPath, { recursive: true });
      this.targetFile = path.join(absPath, filename);
    }

    // create the file or empty the file if it exists and is too big
    if (
      !fs.existsSync(this.targetFile) ||
      fs.statSync(this.targetFile).size > fileSizeLimitOnInit
    ) {
      fs.writeFileSync(
        this.targetFile,
        "### Request-Response log generated by unmock\n\n",
      );
    }
  }
  public log(message: string) {
    fs.appendFileSync(this.targetFile, message);
  }
}