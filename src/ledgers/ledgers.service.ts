import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  LedgerStatus,
  LedgerType,
  PersonalLedger,
} from "./entities/personal-ledger.entity.js";
import {
  LedgerRepayment,
  RepaymentMode,
} from "./entities/ledger-repayment.entity.js";
import { User } from "../users/entities/user.entity.js";
import { CreateLedgerDTO } from "./dto/create-ledger.dto.js";
import { UpdateLedgerDTO } from "./dto/update-ledger.dto.js";
import { CreateRepaymentDTO } from "./dto/create-repayment.dto.js";
import { QueryLedgerDTO } from "./dto/query-ledger.dto.js";

export interface TransformedLedgerItem {
  id: string;
  creatorUserId: string;
  creatorName: string;
  creatorEmail: string;
  type: LedgerType; // Effective type from current user's perspective
  counterpartyName: string;
  counterpartyEmail: string | null;
  counterpartyPhone: string | null;
  counterpartyUserId: string | null;
  isCounterpartyRegistered: boolean;
  isCounterpartyView: boolean; // true if current user is borrower seeing lender's entry
  relationship: string | null;
  principalAmount: number;
  settledAmount: number;
  balanceDue: number;
  interestRate: number;
  lentDate: string;
  dueDate: string | null;
  sourceAccountId: string | null;
  sourceAccountName: string | null;
  description: string | null;
  notes: string | null;
  status: LedgerStatus;
  repayments: LedgerRepayment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberSearchResult {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  initials: string;
}

@Injectable()
export class LedgersService {
  constructor(
    @InjectRepository(PersonalLedger)
    private readonly ledgerRepository: Repository<PersonalLedger>,

    @InjectRepository(LedgerRepayment)
    private readonly repaymentRepository: Repository<LedgerRepayment>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Automatically resolve counterparty registered member ID
   * via counterpartyUserId, email, or phone.
   */
  private async resolveCounterpartyUser(
    dto: {
      counterpartyUserId?: string;
      counterpartyEmail?: string;
      counterpartyPhone?: string;
    },
    creatorUserId: string,
  ): Promise<User | null> {
    if (dto.counterpartyUserId) {
      if (dto.counterpartyUserId === creatorUserId) {
        throw new BadRequestException("You cannot record a loan to yourself.");
      }
      return this.userRepository.findOne({
        where: { id: dto.counterpartyUserId },
      });
    }

    if (dto.counterpartyEmail?.trim()) {
      const email = dto.counterpartyEmail.trim().toLowerCase();
      const matched = await this.userRepository
        .createQueryBuilder("u")
        .where("LOWER(u.email) = :email", { email })
        .andWhere("u.id != :creatorUserId", { creatorUserId })
        .getOne();
      if (matched) return matched;
    }

    if (dto.counterpartyPhone?.trim()) {
      const phone = dto.counterpartyPhone.trim();
      const matched = await this.userRepository.findOne({
        where: { phone },
      });
      if (matched && matched.id !== creatorUserId) return matched;
    }

    return null;
  }

  /**
   * Search registered platform members by name, email, or phone
   */
  async searchMembers(
    currentUserId: string,
    query?: string,
  ): Promise<MemberSearchResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const q = `%${query.trim().toLowerCase()}%`;

    const users = await this.userRepository
      .createQueryBuilder("u")
      .select(["u.id", "u.name", "u.email", "u.phone"])
      .where("u.id != :currentUserId", { currentUserId })
      .andWhere(
        "(LOWER(u.name) LIKE :q OR LOWER(u.email) LIKE :q OR u.phone LIKE :q)",
        { q },
      )
      .limit(10)
      .getMany();

    return users.map((u) => {
      const parts = (u.name || u.email).trim().split(/\s+/);
      const initials = (
        (parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
      ).toUpperCase();

      return {
        id: u.id,
        name: u.name || u.email.split("@")[0],
        email: u.email,
        phone: u.phone || null,
        initials: initials || "LF",
      };
    });
  }

  /**
   * Create a new loan record. If the counterparty email/phone matches
   * a registered user, they are linked automatically.
   */
  async create(
    userId: string,
    dto: CreateLedgerDTO,
  ): Promise<PersonalLedger> {
    const counterpartyUser = await this.resolveCounterpartyUser(
      dto,
      userId,
    );

    const ledger = this.ledgerRepository.create({
      userId,
      counterpartyUserId: counterpartyUser?.id ?? null,
      type: dto.type,
      counterpartyName: dto.counterpartyName.trim(),
      counterpartyEmail:
        dto.counterpartyEmail?.trim().toLowerCase() ??
        counterpartyUser?.email ??
        null,
      counterpartyPhone:
        dto.counterpartyPhone?.trim() ?? counterpartyUser?.phone ?? null,
      relationship: dto.relationship?.trim() ?? null,
      principalAmount: dto.principalAmount,
      settledAmount: 0,
      interestRate: dto.interestRate ?? 0,
      lentDate: dto.lentDate ? new Date(dto.lentDate) : new Date(),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      sourceAccountId: dto.sourceAccountId ?? null,
      sourceAccountName: dto.sourceAccountName?.trim() ?? null,
      description: dto.description?.trim() ?? null,
      notes: dto.notes?.trim() ?? null,
      status: LedgerStatus.PENDING,
    });

    return this.ledgerRepository.save(ledger);
  }

  /**
   * Retrieve all loans for current user.
   * If current user is the counterparty of a loan created by another user,
   * it appears bidirectionally with inverted type!
   */
  async findAll(
    userId: string,
    query: QueryLedgerDTO,
  ): Promise<TransformedLedgerItem[]> {
    const currentUser = await this.userRepository.findOne({
      where: { id: userId },
    });
    const userEmail = currentUser?.email?.toLowerCase();
    const userPhone = currentUser?.phone;

    const qb = this.ledgerRepository
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.user", "creator")
      .leftJoinAndSelect("l.counterpartyUser", "counterparty")
      .leftJoinAndSelect("l.repayments", "repayment")
      .where(
        `(l.userId = :userId OR l.counterpartyUserId = :userId ${
          userEmail ? "OR LOWER(l.counterpartyEmail) = :userEmail" : ""
        } ${userPhone ? "OR l.counterpartyPhone = :userPhone" : ""})`,
        {
          userId,
          userEmail,
          userPhone,
        },
      )
      .orderBy("l.createdAt", "DESC")
      .addOrderBy("repayment.paymentDate", "DESC");

    const rawRecords = await qb.getMany();

    // Transform from current user's perspective
    const transformed: TransformedLedgerItem[] = rawRecords.map((r) => {
      const isCreator = r.userId === userId;

      let effectiveType: LedgerType;
      let displayName: string;
      let displayEmail: string | null;
      let displayPhone: string | null;
      let displayUserId: string | null;

      if (isCreator) {
        effectiveType = r.type;
        displayName = r.counterpartyName;
        displayEmail = r.counterpartyEmail;
        displayPhone = r.counterpartyPhone;
        displayUserId = r.counterpartyUserId;
      } else {
        // Counterparty perspective: Invert type!
        // If creator LENT money, counterparty has BORROWED it.
        effectiveType =
          r.type === LedgerType.LENT ? LedgerType.BORROWED : LedgerType.LENT;
        displayName = r.user?.name || r.user?.email || "Connected Member";
        displayEmail = r.user?.email || null;
        displayPhone = r.user?.phone || null;
        displayUserId = r.user?.id || r.userId;
      }

      const principal = Number(r.principalAmount);
      const settled = Number(r.settledAmount);
      const balanceDue = Math.max(0, principal - settled);

      // Re-evaluate overdue status
      const today = new Date();
      let status = r.status;
      if (
        status !== LedgerStatus.SETTLED &&
        r.dueDate &&
        new Date(r.dueDate) < today &&
        balanceDue > 0
      ) {
        // Keep status or track overdue
      }

      return {
        id: r.id,
        creatorUserId: r.userId,
        creatorName: r.user?.name || r.user?.email || "You",
        creatorEmail: r.user?.email || "",
        type: effectiveType,
        counterpartyName: displayName,
        counterpartyEmail: displayEmail,
        counterpartyPhone: displayPhone,
        counterpartyUserId: displayUserId,
        isCounterpartyRegistered: Boolean(r.counterpartyUserId || !isCreator),
        isCounterpartyView: !isCreator,
        relationship: r.relationship,
        principalAmount: principal,
        settledAmount: settled,
        balanceDue,
        interestRate: Number(r.interestRate),
        lentDate: r.lentDate ? String(r.lentDate).slice(0, 10) : "",
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
        sourceAccountId: r.sourceAccountId,
        sourceAccountName: r.sourceAccountName,
        description: r.description,
        notes: r.notes,
        status,
        repayments: r.repayments || [],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    // Apply in-memory filters for effective perspective
    return transformed.filter((item) => {
      if (query.type && query.type !== ("ALL" as any) && item.type !== query.type) {
        return false;
      }

      if (query.status && query.status !== ("ALL" as any)) {
        if (query.status === "OVERDUE" as any) {
          const isOverdue =
            item.status !== LedgerStatus.SETTLED &&
            item.dueDate &&
            new Date(item.dueDate) < new Date() &&
            item.balanceDue > 0;
          if (!isOverdue) return false;
        } else if (item.status !== query.status) {
          return false;
        }
      }

      if (query.search?.trim()) {
        const s = query.search.trim().toLowerCase();
        const matchName = item.counterpartyName.toLowerCase().includes(s);
        const matchNotes = item.notes?.toLowerCase().includes(s);
        const matchDesc = item.description?.toLowerCase().includes(s);
        const matchAccount = item.sourceAccountName?.toLowerCase().includes(s);
        if (!matchName && !matchNotes && !matchDesc && !matchAccount) {
          return false;
        }
      }

      if (query.timeframe) {
        const today = new Date();
        if (query.timeframe === "OVERDUE") {
          return (
            item.status !== LedgerStatus.SETTLED &&
            item.dueDate &&
            new Date(item.dueDate) < today &&
            item.balanceDue > 0
          );
        }
        if (query.timeframe === "SETTLED") {
          return item.status === LedgerStatus.SETTLED || item.balanceDue === 0;
        }
        if (query.timeframe === "DUE_THIS_MONTH") {
          if (!item.dueDate || item.balanceDue === 0) return false;
          const due = new Date(item.dueDate);
          return (
            due.getFullYear() === today.getFullYear() &&
            due.getMonth() === today.getMonth()
          );
        }
        if (query.timeframe === "DUE_THIS_WEEK") {
          if (!item.dueDate || item.balanceDue === 0) return false;
          const due = new Date(item.dueDate);
          const diffDays = Math.ceil(
            (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          );
          return diffDays >= 0 && diffDays <= 7;
        }
      }

      return true;
    });
  }

  /**
   * Get single loan with full repayments list
   */
  async findOne(userId: string, id: string): Promise<TransformedLedgerItem> {
    const records = await this.findAll(userId, {});
    const match = records.find((r) => r.id === id);
    if (!match) {
      throw new NotFoundException("Loan entry not found or unauthorized.");
    }
    return match;
  }

  /**
   * Update loan (only creator can update original terms)
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateLedgerDTO,
  ): Promise<PersonalLedger> {
    const ledger = await this.ledgerRepository.findOne({
      where: { id },
    });

    if (!ledger) {
      throw new NotFoundException("Loan entry not found.");
    }
    if (ledger.userId !== userId) {
      throw new ForbiddenException(
        "Only the creator of this loan entry can modify its details.",
      );
    }

    if (
      dto.counterpartyUserId !== undefined ||
      dto.counterpartyEmail !== undefined ||
      dto.counterpartyPhone !== undefined
    ) {
      const counterpartyUser = await this.resolveCounterpartyUser(
        {
          counterpartyUserId: dto.counterpartyUserId ?? ledger.counterpartyUserId ?? undefined,
          counterpartyEmail: dto.counterpartyEmail ?? ledger.counterpartyEmail ?? undefined,
          counterpartyPhone: dto.counterpartyPhone ?? ledger.counterpartyPhone ?? undefined,
        },
        userId,
      );
      ledger.counterpartyUserId = counterpartyUser?.id ?? null;
    }

    if (dto.counterpartyName !== undefined) {
      ledger.counterpartyName = dto.counterpartyName.trim();
    }
    if (dto.counterpartyEmail !== undefined) {
      ledger.counterpartyEmail = dto.counterpartyEmail?.trim().toLowerCase() ?? null;
    }
    if (dto.counterpartyPhone !== undefined) {
      ledger.counterpartyPhone = dto.counterpartyPhone?.trim() ?? null;
    }
    if (dto.relationship !== undefined) {
      ledger.relationship = dto.relationship?.trim() ?? null;
    }
    if (dto.principalAmount !== undefined) {
      ledger.principalAmount = dto.principalAmount;
    }
    if (dto.interestRate !== undefined) {
      ledger.interestRate = dto.interestRate;
    }
    if (dto.lentDate !== undefined) {
      ledger.lentDate = new Date(dto.lentDate);
    }
    if (dto.dueDate !== undefined) {
      ledger.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.sourceAccountId !== undefined) {
      ledger.sourceAccountId = dto.sourceAccountId ?? null;
    }
    if (dto.sourceAccountName !== undefined) {
      ledger.sourceAccountName = dto.sourceAccountName?.trim() ?? null;
    }
    if (dto.description !== undefined) {
      ledger.description = dto.description?.trim() ?? null;
    }
    if (dto.notes !== undefined) {
      ledger.notes = dto.notes?.trim() ?? null;
    }
    if (dto.status !== undefined) {
      ledger.status = dto.status;
    }

    return this.ledgerRepository.save(ledger);
  }

  /**
   * Delete loan entry (only creator can delete)
   */
  async remove(userId: string, id: string): Promise<{ success: boolean; message: string }> {
    const ledger = await this.ledgerRepository.findOne({
      where: { id },
    });

    if (!ledger) {
      throw new NotFoundException("Loan entry not found.");
    }
    if (ledger.userId !== userId) {
      throw new ForbiddenException(
        "Only the creator can remove this loan record.",
      );
    }

    await this.ledgerRepository.remove(ledger);
    return { success: true, message: "Loan entry deleted successfully." };
  }

  /**
   * Record a partial or full repayment. Either the lender or borrower member can log it!
   */
  async recordRepayment(
    userId: string,
    ledgerId: string,
    dto: CreateRepaymentDTO,
  ): Promise<{ repayment: LedgerRepayment; updatedLedger: PersonalLedger }> {
    return this.dataSource.transaction(async (manager) => {
      const ledger = await manager.findOne(PersonalLedger, {
        where: { id: ledgerId },
        lock: { mode: "pessimistic_write" },
      });

      if (!ledger) {
        throw new NotFoundException("Loan entry not found.");
      }

      // Check access: creator or counterparty member
      const isCreator = ledger.userId === userId;
      const isCounterparty = ledger.counterpartyUserId === userId;

      if (!isCreator && !isCounterparty) {
        // Also check email match
        const user = await manager.findOne(User, { where: { id: userId } });
        const matchesEmail =
          user?.email &&
          ledger.counterpartyEmail &&
          user.email.toLowerCase() === ledger.counterpartyEmail.toLowerCase();
        if (!matchesEmail) {
          throw new ForbiddenException(
            "You are not authorized to record repayments for this loan.",
          );
        }
      }

      const balanceDue = Number(ledger.principalAmount) - Number(ledger.settledAmount);
      if (dto.amount > balanceDue + 0.01) {
        throw new BadRequestException(
          `Repayment amount (₹${dto.amount}) exceeds the remaining balance due of ₹${balanceDue.toFixed(2)}.`,
        );
      }

      // 1. Create repayment record
      const repayment = manager.create(LedgerRepayment, {
        ledgerId: ledger.id,
        recordedByUserId: userId,
        amount: dto.amount,
        paymentDate: new Date(dto.paymentDate),
        paymentMode: dto.paymentMode || RepaymentMode.UPI,
        referenceId: dto.referenceId?.trim() ?? null,
        notes: dto.notes?.trim() ?? null,
      });
      const savedRepayment = await manager.save(repayment);

      // 2. Update settled amount and status
      const newSettledAmount = Number(ledger.settledAmount) + dto.amount;
      ledger.settledAmount = Number(newSettledAmount.toFixed(2));

      if (ledger.settledAmount >= Number(ledger.principalAmount) - 0.01) {
        ledger.status = LedgerStatus.SETTLED;
      } else {
        ledger.status = LedgerStatus.PARTIALLY_PAID;
      }

      const savedLedger = await manager.save(ledger);

      return {
        repayment: savedRepayment,
        updatedLedger: savedLedger,
      };
    });
  }

  /**
   * Delete a repayment and recalculate ledger balance
   */
  async deleteRepayment(
    userId: string,
    ledgerId: string,
    repaymentId: string,
  ): Promise<{ success: boolean; updatedLedger: PersonalLedger }> {
    return this.dataSource.transaction(async (manager) => {
      const ledger = await manager.findOne(PersonalLedger, {
        where: { id: ledgerId },
        lock: { mode: "pessimistic_write" },
      });

      if (!ledger) {
        throw new NotFoundException("Loan entry not found.");
      }
      if (ledger.userId !== userId) {
        throw new ForbiddenException(
          "Only the loan creator can remove repayment records.",
        );
      }

      const repayment = await manager.findOne(LedgerRepayment, {
        where: { id: repaymentId, ledgerId },
      });

      if (!repayment) {
        throw new NotFoundException("Repayment record not found.");
      }

      const repaidAmount = Number(repayment.amount);
      await manager.remove(repayment);

      ledger.settledAmount = Math.max(0, Number(ledger.settledAmount) - repaidAmount);
      if (ledger.settledAmount === 0) {
        ledger.status = LedgerStatus.PENDING;
      } else if (ledger.settledAmount >= Number(ledger.principalAmount)) {
        ledger.status = LedgerStatus.SETTLED;
      } else {
        ledger.status = LedgerStatus.PARTIALLY_PAID;
      }

      const updatedLedger = await manager.save(ledger);
      return { success: true, updatedLedger };
    });
  }

  /**
   * Get KPI summary metrics for Money Lent and Money Borrowed
   */
  async getSummaryMetrics(userId: string) {
    const all = await this.findAll(userId, {});

    const lentItems = all.filter((item) => item.type === LedgerType.LENT);
    const borrowedItems = all.filter((item) => item.type === LedgerType.BORROWED);

    const today = new Date();

    const calcGroup = (items: TransformedLedgerItem[]) => {
      const totalOriginal = items.reduce((acc, i) => acc + i.principalAmount, 0);
      const totalSettled = items.reduce((acc, i) => acc + i.settledAmount, 0);
      const balanceDue = items.reduce((acc, i) => acc + i.balanceDue, 0);
      const activeItems = items.filter((i) => i.balanceDue > 0);
      const overdueItems = activeItems.filter(
        (i) => i.dueDate && new Date(i.dueDate) < today,
      );
      const overdueAmount = overdueItems.reduce((acc, i) => acc + i.balanceDue, 0);
      const uniqueContacts = new Set(
        activeItems.map((i) => i.counterpartyName.toLowerCase()),
      ).size;
      const settledCount = items.filter(
        (i) => i.status === LedgerStatus.SETTLED || i.balanceDue === 0,
      ).length;

      return {
        totalOriginal: Number(totalOriginal.toFixed(2)),
        totalSettled: Number(totalSettled.toFixed(2)),
        balanceDue: Number(balanceDue.toFixed(2)),
        activeCount: activeItems.length,
        overdueCount: overdueItems.length,
        overdueAmount: Number(overdueAmount.toFixed(2)),
        uniqueContacts,
        settledCount,
        recoveryRatePercent:
          totalOriginal > 0
            ? Number(((totalSettled / totalOriginal) * 100).toFixed(1))
            : 0,
      };
    };

    return {
      lent: calcGroup(lentItems),
      borrowed: calcGroup(borrowedItems),
    };
  }
}
