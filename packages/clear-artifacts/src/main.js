const core = require('@actions/core');
const context = require('@actions/github').context;
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils');
const { throttling } = require('@octokit/plugin-throttling');
const { HttpsProxyAgent } = require("https-proxy-agent");
const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require("yauzl");
const YAML = require('yaml');

const GitHubOctokit = GitHub.plugin(throttling);

const agent = new HttpsProxyAgent("http://127.0.0.1:25002");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

async function publishRelease() {
  let tmpDir;
  try {
    const artifactName = 'electron-builder-latest';
    const maxArtifactsToClear = 3;
    const tagName = '0.2.1';
    const token = process.env.GITHUB_TOKEN;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-artifacts'));
    console.info(tmpDir)

    const octokit = new GitHubOctokit(
      getOctokitOptions(token, {
        request: {
          agent,
        },
        throttle: {
          onRateLimit: (retryAfter, options) => {
            octokit.log.warn(
              `Request quota exhausted for request ${options.method} ${options.url}`
            );

            // Retry twice after hitting a rate limit error, then give up
            if (options.request.retryCount <= 2) {
              console.log(`Retrying after ${retryAfter} seconds!`);
              return true;
            }
          },
          onAbuseLimit: (retryAfter, options) => {
            // does not retry, only logs a warning
            octokit.log.warn(
              `Abuse detected for request ${options.method} ${options.url}`
            );
          },
        },
      })
    );
    const { data: { artifacts: allArtifacts, total_count: artifactCount } } =
      await octokit.rest.actions.listArtifactsForRepo(context.repo);

    console.dir(allArtifacts)

    const artifactsForName = allArtifacts.filter(
      ({ expired, name }) => !expired && name === artifactName
    );

    console.dir(artifactsForName)

    if (artifactsForName.length <= 0) {
      core.warning(
        `No active artifact(s) found with a name of '${artifactName}'`
      );
      core.setOutput('artifacts-cleared', false);
      return;
    }
    core.info(
      `Found ${artifactsForName.length} active artifact(s) whose name matches '${artifactName}'`
    );

    if (artifactsForName.length > maxArtifactsToClear) {
      core.warning(
        `${artifactsForName.length - maxArtifactsToClear} artifact(s) will not be cleared since they are above the threshold`
      )
    }

    let artifactsCleared = false;
    for (let index = 0; index < artifactsForName.length && index < maxArtifactsToClear; index++) {
      const response = await octokit.rest.actions.downloadArtifact({
        ...context.repo,
        artifact_id: artifactsForName[index].id,
        archive_format: "zip",
      });
      console.dir(response)

      await new Promise((resolve, reject) => {
        yauzl.fromBuffer(Buffer.from(response.data), {lazyEntries: true}, function(err, zipfile) {
          if (err) {
            return void reject(err);
          }
          zipfile.readEntry();
          zipfile.once("end", function() {
            zipfile.close();
            resolve(undefined)
          });
          zipfile.on("entry", function(entry) {
            if (/\/$/.test(entry.fileName)) {
              // Directory file names end with '/'.
              // Note that entries for directories themselves are optional.
              // An entry's fileName implicitly requires its parent directories to exist.
              zipfile.readEntry();
            } else {
              // file entry
              zipfile.openReadStream(entry, function(err, readStream) {
                if (err) {
                  return void reject(err);
                }
                readStream.on("end", function() {
                  zipfile.readEntry();
                });
                const writer = fs.createWriteStream(`${tmpDir}/${entry.fileName}`)
                readStream.pipe(writer);
              });
            }
          });
        });
      })

      const yamlFileVersions = await new Promise((resolve, reject) => {
        fs.readdir(`${tmpDir}`, (err, files) => {
          if (err) {
            return void reject(err)
          }
          resolve([...new Set(files.filter(fileName => fileName.includes("yml")).map(fileName => YAML.parse(
            fs.readFileSync(`${tmpDir}/${fileName}`, 'utf8')
          ).version))])
        });
      })
      console.dir(yamlFileVersions)
      if (yamlFileVersions.some(version => version.includes(tagName))) {
        artifactsCleared = artifactsCleared || true;
        core.info(`Clearing artifact with id ${artifactsForName[index].id}`);
        await octokit.rest.actions.deleteArtifact({
          ...context.repo,
          artifact_id: artifactsForName[index].id,
        });
      } else {
        core.warning(`Artifact does not match tag name '${tagName}'`)
      }
    }

    core.setOutput('artifacts-cleared', artifactsCleared);
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  } finally {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
}

publishRelease();
