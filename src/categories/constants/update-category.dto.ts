import { PartialType } from "@nestjs/mapped-types";
import { CreateCategoryDTO } from "../dto/create-category.dto.js";

export class UpdateCategoryDTO extends PartialType(CreateCategoryDTO) {}
