import { Repo } from "@/schema/repo";
import { groupBy, writeToRepoDetails } from "@/utils/helper";

const populateRepoDetails = async (owner: string, repo_name: string) => {
  try {
    console.log(`[${owner}/${repo_name}]: Getting info...`);

    const metadataPromise = fetch(
      `https://api.github.com/repos/${owner}/${repo_name}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "request",
        },
      }
    );
    const issuesPromise = fetch(
      `https://api.github.com/repos/${owner}/${repo_name}/issues?labels=${encodeURIComponent(
        "good first issue"
      )}&state=open&per_page=10&sort=created&direction=desc`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "request",
        },
      }
    );

    const responses = await Promise.allSettled([
      metadataPromise,
      issuesPromise,
    ]);
    const [metadata, issues] = await Promise.all(
      responses
        .map(async (response) => {
          if (response.status === "fulfilled") {
            const data = await response.value.json();
            return data;
          } else {
            return null;
          }
        })
        .filter(Boolean)
    );

    // Filters
    if (metadata?.archived) {
      console.log(`[${owner}/${repo_name}]: Repository is archived.`);
      return null;
    }

    if (issues?.length < 3) {
      console.log(
        `[${owner}/${repo_name}]: Does not have enough good first issues.`
      );
      return null;
    }

    const payload: Repo = {
      name: repo_name,
      owner,
      description: metadata.description,
      language: metadata.language,
      url: metadata.html_url,
      stars: metadata.stargazers_count,
      last_modified: new Date(metadata.pushed_at).toISOString(),
      id: String(metadata.id),
      issues:
        // TODO: Find a way to add types here
        issues?.map((issue: any) => ({
          title: issue.title,
          url: issue.html_url,
          number: issue.number,
          comments_count: issue.comments,
          created_at: new Date(issue.created_at).toISOString(),
        })) ?? [],
    };

    return payload;
  } catch (e: any) {
    console.log(`[${owner}/${repo_name}]: ${e.message}`);
    return null;
  }
};

export const populate = async (repos: string[]): Promise<Repo[]> => {
  const promises = repos.map((repo) => {
    const [owner, repo_name] = repo.split("/");
    return populateRepoDetails(owner, repo_name);
  });

  const responsesJSON = await Promise.allSettled(promises);
  const responses = responsesJSON
    .filter(
      (res): res is PromiseFulfilledResult<Repo> => res.status === "fulfilled"
    )
    .map((res) => res.value)
    .filter(Boolean);

  writeToRepoDetails(groupBy(responses, "language"));

  return responses;
};
