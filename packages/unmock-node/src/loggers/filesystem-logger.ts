import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import {
  IListener,
  ISerializedRequest,
  ISerializedResponse,
} from "unmock-core/dist/interfaces";
import { resolveUnmockRootDirectory } from "../utils";

const fileSizeLimitOnInit = 5 * 1024 ** 2; // 5 MB

export default class FSLogger implements IListener {
  private static toIndentedYaml(
    input: ISerializedRequest | ISerializedResponse,
  ) {
    return yaml
      .dump(input)
      .split("\n")
      .map(
        (line: string) =>
          `\t${line.replace("!<tag:yaml.org,2002:js/undefined> ''", "")}`,
      )
      .join("\n");
  }
  private readonly enabled: boolean;
  private targetFile?: string;

  constructor({
    directory,
    filename = "unmock.log",
  }: {
    directory?: string;
    filename?: string;
  }) {
    const absPath = directory || resolveUnmockRootDirectory();

    if (!(fs.existsSync(absPath) && fs.statSync(absPath).isDirectory())) {
      this.enabled = false;
      return;
    }

    this.enabled = true;

    this.targetFile = path.join(absPath, filename);

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

  public notify({
    req,
    res,
  }: {
    req: ISerializedRequest;
    res?: ISerializedResponse;
  }) {
    if (!this.enabled) {
      return;
    }
    fs.appendFileSync(
      this.targetFile!,
      `[${new Date().toISOString()}]:\n\n` +
        `Intercepted request:\n${FSLogger.toIndentedYaml(req)}\n\n\n` +
        (res
          ? `Generated response:\n${FSLogger.toIndentedYaml(res)}`
          : "No matching response") +
        `\n\n=============================================\n\n`,
    );
  }
}
