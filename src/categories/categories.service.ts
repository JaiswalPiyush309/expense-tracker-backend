import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Category, CategoryType } from "./entities/category.entity.js";
import { DataSource, Repository } from "typeorm";
import { DEFAULT_CATEGORIES } from "./constants/default-categories.constant.js";
import { UpdateCategoryDTO } from "./constants/update-category.dto.js";
import { CreateCategoryDTO } from "./dto/create-category.dto.js";

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Automatically runs when CategoriesModule loads.
   * Seeds system-level default categories if they do not exist yet.
   */
  async onModuleInit(): Promise<void> {
    await this.seedDefaultCategories();
  }

  async seedDefaultCategories(): Promise<void> {
    const existingSystemCategories = await this.categoryRepository.find({
      where: { isSystem: true },
    });

    const existingNames = new Set(
      existingSystemCategories.map((c) => `${c.name.toLowerCase()}_${c.type}`),
    );

    const categoriesToSeed = DEFAULT_CATEGORIES.filter(
      (cat) => !existingNames.has(`${cat.name.toLowerCase()}_${cat.type}`),
    ).map((cat) =>
      this.categoryRepository.create({
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
        isSystem: true,
        userId: null,
      }),
    );

    if (categoriesToSeed.length > 0) {
      await this.categoryRepository.save(categoriesToSeed);
    }
  }

  /**
   * Fetches categories available to the user (all system categories + user's custom categories).
   * Supports optional filtering by CategoryType (EXPENSE | INCOME).
   */
  async findAll(userId: string, type?: CategoryType): Promise<Category[]> {
    const query = this.categoryRepository
      .createQueryBuilder("cat")
      .where("(cat.userId = :userId OR cat.isSystem = true)", { userId });

    if (type) {
      query.andWhere("cat.type = :type", { type });
    }

    // Orders system categories first, followed by alphabetical order
    return query
      .orderBy("cat.isSystem", "DESC")
      .addOrderBy("cat.name", "ASC")
      .getMany();
  }

  /**
   * Lightweight endpoint for dropdown options in "Add Expense / Add Income" modal.
   */
  async getDropdownOptions(userId: string, type?: CategoryType) {
    const categories = await this.findAll(userId, type);

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      isSystem: c.isSystem,
      isCustom: !c.isSystem,
    }));
  }

  async findOne(userId: string, id: string): Promise<Category> {
    const category = await this.categoryRepository
      .createQueryBuilder("cat")
      .where("cat.id = :id", { id })
      .andWhere("(cat.userId = :userId OR cat.isSystem = true)", { userId })
      .getOne();

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    return category;
  }

  /**
   * Creates a custom category for the user.
   * Prevents creating duplicate names under the same type for this user.
   */
  async create(userId: string, dto: CreateCategoryDTO): Promise<Category> {
    const trimmedName = dto.name.trim();

    // Check if category with this name already exists for user (or as a system category)
    const existing = await this.categoryRepository
      .createQueryBuilder("cat")
      .where("LOWER(cat.name) = LOWER(:name)", { name: trimmedName })
      .andWhere("cat.type = :type", { type: dto.type })
      .andWhere("(cat.userId = :userId OR cat.isSystem = true)", { userId })
      .getOne();

    if (existing) {
      throw new ConflictException(
        `Category "${trimmedName}" already exists under ${dto.type.toLowerCase()}s`,
      );
    }

    const category = this.categoryRepository.create({
      name: trimmedName,
      type: dto.type,
      icon:
        dto.icon ||
        (dto.type === CategoryType.EXPENSE ? "shopping-bag" : "wallet"),
      color: dto.color || "#3B82F6",
      userId,
      isSystem: false,
    });

    return this.categoryRepository.save(category);
  }

  /**
   * Updates user's custom category. System categories cannot be modified.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDTO,
  ): Promise<Category> {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (category.isSystem || category.userId !== userId) {
      throw new ForbiddenException(
        "Default system categories cannot be modified",
      );
    }

    const trimmedName = dto.name?.trim() ?? category.name;
    const nextType = dto.type ?? category.type;
    if (
      trimmedName.toLowerCase() !== category.name.toLowerCase() ||
      nextType !== category.type
    ) {
      const duplicate = await this.categoryRepository
        .createQueryBuilder("cat")
        .where("LOWER(cat.name) = LOWER(:name)", { name: trimmedName })
        .andWhere("cat.type = :type", { type: nextType })
        .andWhere("cat.id != :id", { id })
        .andWhere("(cat.userId = :userId OR cat.isSystem = true)", { userId })
        .getOne();

      if (duplicate) {
        throw new ConflictException(`Category "${trimmedName}" already exists`);
      }

    }

    if (dto.name !== undefined) category.name = trimmedName;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.color !== undefined) category.color = dto.color;
    if (dto.type !== undefined) category.type = dto.type;

    return this.categoryRepository.save(category);
  }

  /**
   * Removes a custom category.
   * System categories cannot be deleted.
   * If transactions are linked to this category, their categoryId will be set to NULL via ON DELETE SET NULL.
   */
  async remove(userId: string, id: string): Promise<{ message: string }> {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (category.isSystem || category.userId !== userId) {
      throw new ForbiddenException(
        "Default system categories cannot be deleted",
      );
    }

    await this.categoryRepository.remove(category);

    return { message: "Category removed successfully" };
  }
}
