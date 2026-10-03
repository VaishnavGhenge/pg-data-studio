import { StarIcon } from "./icons";

export function FavoriteButton({
  schema,
  name,
  favorite,
  onToggle,
}: {
  schema: string;
  name: string;
  favorite: boolean;
  onToggle: () => void;
}) {
  const label = `${favorite ? "Remove" : "Add"} ${schema}.${name} ${favorite ? "from" : "to"} favorites`;
  return (
    <button
      className="icon-btn favorite-button"
      aria-label={label}
      title={label}
      aria-pressed={favorite}
      onClick={(event) => {
        event.stopPropagation();
        const control = event.currentTarget;
        const hadFocus = document.activeElement === control;
        onToggle();
        requestAnimationFrame(() => {
          if (!hadFocus || control.isConnected) return;
          const label = `Add ${schema}.${name} to favorites`;
          Array.from(document.querySelectorAll<HTMLButtonElement>(".favorite-button"))
            .find((button) => button.title === label)
            ?.focus();
        });
      }}
    >
      <StarIcon size={14} filled={favorite} />
    </button>
  );
}
