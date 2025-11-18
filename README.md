# Use OpenAI GPT Model to Review Pull Requests for Azure DevOps
Azure DevOps task that adds comments to Pull Requests with the help of ChatGPT.

## Installation
The task installation can be done using the [Visual Studio MarketPlace](https://marketplace.visualstudio.com/publishers/jpcompcombr).

## Azure OpenAI Service

Azure OpenAI supports two endpoint formats:

**Format 1 (Legacy):**
```
https://{RESOURCE}.openai.azure.com/openai/deployments/{MODEL_NAME}/chat/completions?api-version={API_VERSION}
```

**Format 2 (Current):**
```
https://{ADMIN-RESOURCE}.{REGION}.cognitiveservices.azure.com/openai/deployments/{MODEL_NAME}/chat/completions?api-version={API_VERSION}
```

**Example:**
```
https://admin-ma4fdje4-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-4.1-jailtons/chat/completions?api-version=2025-01-01-preview
```

[REST API Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference).

### Grant Permissions to the Build Service Agent
Before using this task, make sure the build service has permissions to contribute to your REPOSITORY:

![contribute_to_pr](https://github.com/junior151280/azure-pipeline-code-review-ai/blob/main/images/contribute_to_pr.png?raw=true)

### Allow the Task to Access the System Token
Add a checkout section with persistCredentials set to true.

#### YAML Pipelines
```yaml
jobs:
- job:
  displayName: "JPCompcombr code review"
  pool:
    vmImage: ubuntu-latest 
 
  steps:
  - checkout: self
    persistCredentials: true

  - task: JPCompcombr@20
    displayName: GPTPullRequestReview
    inputs:
      api_key: 'YOUR_TOKEN'
      model: 'gpt-4'
      aoi_endpoint: 'https://{XXXXXXXX}.azure.com/openai/deployments/{MODEL_NAME}/chat/completions?api-version={API_VERSION}'
      aoi_tokenMax: 1000
      aoi_temperature: 0
      file_extensions: 'js,ts,css,html'
      file_excludes: 'file1.js,file2.py,secret.txt'
      additional_prompts: 'Comma-separated prompts, example: check variable naming, ensure consistent indentation, review error handling approach'
```

## License
[MIT](https://raw.githubusercontent.com/junior151280/azure-pipeline-code-review-ai/main/LICENSE)

## Plus
[Devops Publish](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops)
