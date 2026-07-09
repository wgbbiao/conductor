import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ArtifactsService } from "./artifacts.service";

@Controller()
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get("tool-runs/:id/diff")
  async diff(@Param("id") id: string) {
    const diff = await this.artifacts.getDiff(id);
    if (diff === null) throw new NotFoundException("无 diff（ToolRun 可能未成功）");
    return { diff };
  }
}
