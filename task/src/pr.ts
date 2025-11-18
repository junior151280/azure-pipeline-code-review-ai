import * as tl from "azure-pipelines-task-lib/task";

export async function addCommentToPR(fileName: string, comment: string) {
  const body = {
    comments: [
      {
        parentCommentId: 0,
        content: comment,
        commentType: 1
      }
    ],
    status: 1,
    threadContext: {
      filePath: fileName,
    }
  }

  const prUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`

  console.log(`Attempting to add comment to PR for file: ${fileName}`);
  console.log(`PR URL: ${prUrl}`);

  let response = await fetch(prUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
    // Note: Native fetch in Node.js 20+ doesn't support custom agents directly
    // The agent parameter is only used for backwards compatibility
  } as any);

  console.log(`Response status: ${response.status} ${response.statusText}`);

  if (response.status === 401) {
    const errorMsg = "The Build Service must have 'Contribute to pull requests' access to the repository. See https://stackoverflow.com/a/57985733 for more information. Also review the resource permissions such as token and endpoint link.";
    console.error(errorMsg);
    tl.setResult(tl.TaskResult.Failed, errorMsg);
  }
  else if (response.status >= 200 && response.status < 300) {
    console.log(`✓ Comment successfully added to file: ${fileName}`);
  }
  else {
    const responseText = await response.text();
    console.error(`Failed to add comment. Status: ${response.status}`);
    console.error(`Response body: ${responseText}`);
    throw new Error(`Failed to add comment to PR: ${response.status} - ${responseText}`);
  }
}

export async function deleteExistingComments() {
  console.log("Initializing...");

  const threadsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`;
  const threadsResponse = await fetch(threadsUrl, {
    headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` }
  } as any);

  const threads = await threadsResponse.json() as { value: [] };
  const threadsWithContext = threads.value.filter((thread: any) => thread.threadContext !== null);

  const collectionUri = tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI') as string;
  const collectionName = getCollectionName(collectionUri);
  const buildServiceName = `${tl.getVariable('SYSTEM.TEAMPROJECT')} Build Service (${collectionName})`;

  for (const thread of threadsWithContext as any[]) {
    const commentsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments?api-version=5.1`;
    const commentsResponse = await fetch(commentsUrl, {
      headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` }
    } as any);

    const comments = await commentsResponse.json() as { value: [] };

    for (const comment of comments.value.filter((comment: any) => comment.author.displayName === buildServiceName) as any[]) {
      const removeCommentUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments/${comment.id}?api-version=5.1`;

      await fetch(removeCommentUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` }
      } as any);
    }
  }

  console.log("Deleting pre-existing comments...");
}

function getCollectionName(collectionUri: string) {
  const collectionUriWithoutProtocol = collectionUri!.replace('https://', '').replace('http://', '');

  if (collectionUriWithoutProtocol.includes('.visualstudio.')) {
    return collectionUriWithoutProtocol.split('.visualstudio.')[0];
  }
  else {
    return collectionUriWithoutProtocol.split('/')[1];
  }
}