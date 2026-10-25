/**
 * The name someone is shown as IN THIS SERVER: server nickname → global display name → username.
 *
 * Always asks Discord (force: true). The member cache can hold a stale nickname because Orbit
 * doesn't use the privileged Server Members intent, so it never hears about nickname changes.
 * Never throws: falls back to the user ID if Discord can't be reached.
 */
export async function serverName(guild, userId) {
  try {
    const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
    if (member) return member.displayName; // nickname ?? user.globalName ?? user.username
    const user = await guild.client.users.fetch(userId).catch(() => null);
    return user?.displayName ?? userId;
  } catch {
    return userId;
  }
}
