// A "use server" module may only export async functions, so the shape its
// actions return - and the initial value the form starts from - live here
// beside them rather than inside them.
export type FormState = { error?: string; ok?: string } | null;

export const initialState: FormState = null;
