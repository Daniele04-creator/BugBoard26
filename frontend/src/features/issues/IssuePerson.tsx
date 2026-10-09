import { IconUser } from "../../components/Icons";
import { Avatar } from "../../components/Avatar";
import type { UserRef } from "../../api/types";
import { userName } from "./issuePresentation";

export function IssuePerson({ user }: { user: UserRef | null }) {
  return (
    <span className="issue-person">
      {user ? (
        <Avatar name={userName(user)} id={user.id} size={22} />
      ) : (
        <IconUser size={16} stroke={2} aria-hidden="true" />
      )}
      <span>{userName(user)}</span>
    </span>
  );
}
