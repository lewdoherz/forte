/**
 * No dialog is open for the current route. Required so the `@modal` slot can
 * render empty while the Library and detail pages occupy `children`.
 */
export default function ExerciseModalDefault() {
  return null;
}
