export class CreateProjectDto {
  name!: string;
  repoUrl!: string;
  defaultBranch?: string;
  description?: string;
}
