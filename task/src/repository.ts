import * as tl from "azure-pipelines-task-lib/task";
import { SimpleGit, SimpleGitOptions, simpleGit } from "simple-git";
import binaryExtensions from "binary-extensions";
import { minimatch } from "minimatch";

export class Repository {

    private gitOptions: Partial<SimpleGitOptions> = {
        baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
        binary: 'git'
    };

    private readonly _repository: SimpleGit;

    constructor() {
        this._repository = simpleGit(this.gitOptions);
        this._repository.addConfig('core.pager', 'cat');
        this._repository.addConfig('core.quotepath', 'false');
    }

    public async GetChangedFiles(fileExtensions: string | undefined, filesToExclude: string | undefined): Promise<string[]> {
        await this._repository.fetch();

        let targetBranch = this.GetTargetBranch();

        let diffs = await this._repository.diff([targetBranch, '--name-only', '--diff-filter=AM']);
        let files = diffs.split('\n').filter(line => line.trim().length > 0);
        let filesToReview = files.filter(file => !binaryExtensions.includes(file.slice((file.lastIndexOf(".") - 1 >>> 0) + 2)));

        console.log(`Found ${filesToReview.length} non-binary file(s) to potentially review`);
        console.log(`File extensions filter: ${fileExtensions || '(none)'}`);
        console.log(`File excludes filter: ${filesToExclude || '(none)'}`);

        if(fileExtensions) {
            let patternsToInclude = fileExtensions.trim().split(',').map(p => p.trim()).filter(p => p.length > 0);
            console.log(`Include patterns: ${patternsToInclude.join(', ')}`);
            filesToReview = filesToReview.filter(file => patternsToInclude.some(pattern => minimatch(file, pattern)));
        }
    
        if(filesToExclude) {
            let patternsToExclude = filesToExclude.trim().split(',').map(p => p.trim()).filter(p => p.length > 0);
            console.log(`Exclude patterns: ${patternsToExclude.join(', ')}`);
            const beforeExclusion = filesToReview.length;
            filesToReview = filesToReview.filter(file => {
                const shouldExclude = patternsToExclude.some(pattern => minimatch(file, pattern));
                if (shouldExclude) {
                    console.log(`Excluding file: ${file} (matched pattern)`);
                }
                return !shouldExclude;
            });
            console.log(`Excluded ${beforeExclusion - filesToReview.length} file(s) based on exclude patterns`);
        }


        return filesToReview;
    }

    public async GetDiff(fileName: string): Promise<string> {
        let targetBranch = this.GetTargetBranch();
        
        let diff = await this._repository.diff([targetBranch, '--', fileName]);

        return diff;
    }

    private GetTargetBranch(): string {
        let targetBranchName = tl.getVariable('System.PullRequest.TargetBranchName');

        if (!targetBranchName) {
            targetBranchName = tl.getVariable('System.PullRequest.TargetBranch')?.replace('refs/heads/', '');
        }

        if (!targetBranchName) {
            throw new Error(`Could not find target branch`)
        }

        return `origin/${targetBranchName}`;
    }
}