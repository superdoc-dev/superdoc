/**
 * Consumer typecheck: `User.email` accepts `string | null | undefined`
 * (SD-2867 Kind II).
 *
 * The runtime has always exposed `null` for `superdoc.config.user.email`
 * when the consumer did not provide an email — `DEFAULT_USER.email` is
 * `null`. The public `User` typedef previously narrowed `email?: string`
 * (string or undefined only), which was a lie about runtime behavior.
 * Widening to `email?: string | null` makes the typedef match what
 * consumers can actually observe.
 *
 * This fixture pins the contract: each assignment below must compile
 * under strict mode. If a future change re-narrows `email` to disallow
 * `null`, the `null` cases stop compiling and CI fails.
 */
import type { Config, User } from 'superdoc';
import { SuperDoc } from 'superdoc';

// All three of string, null, undefined are valid email values.
const userWithEmail: User = { name: 'Alice', email: 'alice@example.com' };
const userWithNullEmail: User = { name: 'Default', email: null };
const userWithUndefinedEmail: User = { name: 'Default', email: undefined };
const userOmittingEmail: User = { name: 'Default' };

// Optional fields stay independent of the email change.
const userWithImage: User = { name: 'Alice', email: 'a@b.com', image: 'avatar.png' };
const userWithImageNull: User = { name: 'Default', email: null, image: null };

// `Config.user` accepts the same shape on input. `#init` normalizes a
// partial user by spreading `DEFAULT_USER` over it, so consumers can
// omit `email` (or `name`) without a typecheck failure.
const cfgWithFullUser: Config['user'] = { name: 'Ada', email: 'ada@example.com' };
const cfgWithMinimalUser: Config['user'] = { name: 'Ada' };
const cfgWithNullEmail: Config['user'] = { name: 'Ada', email: null };
const cfgWithEmptyUser: Config['user'] = {};

// Same contract through the `new SuperDoc(...)` constructor parameter.
// Consumers commonly write `new SuperDoc({ selector, user: { name } })`;
// these type-only assignments pin the constructor surface a consumer
// would actually hit. (Type-level only, no runtime construction.)
type SuperDocCtorArg = ConstructorParameters<typeof SuperDoc>[0];
const ctorWithFullUser: SuperDocCtorArg = { selector: '#x', user: { name: 'Ada', email: 'ada@example.com' } };
const ctorWithMinimalUser: SuperDocCtorArg = { selector: '#x', user: { name: 'Ada' } };
const ctorWithNullEmail: SuperDocCtorArg = { selector: '#x', user: { name: 'Ada', email: null } };
const ctorWithUndefinedEmail: SuperDocCtorArg = { selector: '#x', user: { name: 'Ada', email: undefined } };
const ctorWithEmptyUser: SuperDocCtorArg = { selector: '#x', user: {} };
const ctorWithoutUser: SuperDocCtorArg = { selector: '#x' };

// Consumers must narrow before string operations on `email`.
function emailLength(u: User): number {
  if (u.email === null || u.email === undefined) return 0;
  return u.email.length;
}

// Consumer-side narrowing pattern: nullish-coalesce to a fallback.
const fallback: string = userWithNullEmail.email ?? '';

// Reference all bindings so `tsc --noEmit` doesn't strip them.
void [
  userWithEmail,
  userWithNullEmail,
  userWithUndefinedEmail,
  userOmittingEmail,
  userWithImage,
  userWithImageNull,
  cfgWithFullUser,
  cfgWithMinimalUser,
  cfgWithNullEmail,
  cfgWithEmptyUser,
  ctorWithFullUser,
  ctorWithMinimalUser,
  ctorWithNullEmail,
  ctorWithUndefinedEmail,
  ctorWithEmptyUser,
  ctorWithoutUser,
  emailLength,
  fallback,
];
