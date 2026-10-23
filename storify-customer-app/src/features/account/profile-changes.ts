import { GENDERS, UpdateMeRequest, type Me } from '@/contracts/mobile/shop/v1';

type Gender = (typeof GENDERS)[number];

/** The profile form as typed. An empty string is a field the shopper left or made blank. */
export type ProfileValues = {
  name: string;
  phone: string;
  birthday: string;
  gender: Gender | '';
};

export type ProfileField = keyof ProfileValues;

export function profileValues(me: Me): ProfileValues {
  return {
    name: me.name,
    phone: me.phone ?? '',
    birthday: me.birthday ?? '',
    gender: isGender(me.gender) ? me.gender : '',
  };
}

/**
 * What `PATCH /me` is sent: only the fields that changed, trimmed, and `null`
 * for an optional field the shopper emptied, which clears it.
 */
export function profileChanges(me: Me, values: ProfileValues): UpdateMeRequest {
  const changes: UpdateMeRequest = {};
  const name = values.name.trim();
  if (name !== me.name) changes.name = name;

  const phone = optional(values.phone.trim(), me.phone);
  if (phone !== undefined) changes.phone = phone;
  const birthday = optional(values.birthday.trim(), me.birthday);
  if (birthday !== undefined) changes.birthday = birthday;
  if (values.gender !== (me.gender ?? '')) {
    changes.gender = values.gender === '' ? null : values.gender;
  }
  return changes;
}

/**
 * The fields the store would refuse, checked against the contract's own rules,
 * and a birthday that is no day of the calendar or is still to come.
 */
export function profileErrors(changes: UpdateMeRequest, today: Date): ProfileField[] {
  const parsed = UpdateMeRequest.safeParse(changes);
  const fields = new Set<ProfileField>();
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'name' || field === 'phone' || field === 'birthday' || field === 'gender') {
        fields.add(field);
      }
    }
  }
  if (typeof changes.birthday === 'string' && !isPastDay(changes.birthday, today)) {
    fields.add('birthday');
  }
  return [...fields];
}

function optional(typed: string, saved: string | undefined): string | null | undefined {
  if (typed === (saved ?? '')) return undefined;
  return typed === '' ? null : typed;
}

function isGender(value: string | undefined): value is Gender {
  return (GENDERS as readonly string[]).includes(value ?? '');
}

/** `YYYY-MM-DD` that names a real day before `today`. */
function isPastDay(value: string, today: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && date.getTime() < today.getTime();
}
