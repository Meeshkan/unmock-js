import * as expect from "expect";
// import * as path from "path";
import { IFSSnapshotterOptions, IRequestResponsePair } from ".";

export const unmockSnapshot = (options: IFSSnapshotterOptions) => {
  // TODO Ensure destination exists and is writable
  return function(this: expect.MatcherState, obj: IRequestResponsePair) {
    // tslint:disable-next-line:no-console
    console.log(
      "Snapshotting:",
      options.outputFolder,
      this.testPath,
      this.currentTestName,
      obj,
    );

    /* const snapFile = path.join(
        SNAPSHOTS_FOLDER,
        `${path.basename(this.testPath)}.snap`,
      );
      if (!fs.existsSync(SNAPSHOTS_FOLDER)) {
        mkdirp.sync(SNAPSHOTS_FOLDER);
      }
      let contents: {
        [testCallNumber: string]: string;
      } = {};
      if (fs.existsSync(snapFile)) {
        if (CLEARED_SNAPSHOT_FILES.indexOf(snapFile) === -1) {
          // First we delete previous snapshots, then we continuously update them.
          CLEARED_SNAPSHOT_FILES.push(snapFile);
          fs.unlinkSync(snapFile);
        } else {
          contents = require(snapFile);
        }
      }
      const numOfCalls = Object.keys(contents).length + 1;
      contents[`${this.currentTestName} ${numOfCalls}`] = obj;
      const stringContents = Object.keys(contents)
        .map(
          (key: string) =>
            "exports['" +
            key +
            "'] = " +
            JSON.stringify(contents[key], undefined, 2) +
            ";\n",
        )
        .join("\n");
      fs.writeFileSync(snapFile, stringContents); */
    return {
      pass: true,
    };
  };
};

// Always add this, ensures added once per context
expect.addSnapshotSerializer({
  print: (val: any) => JSON.stringify(val, undefined, 2),
  // Smoke test for a value that is a request-response pair
  test: (val: any) => val.req && val.req.method,
});
