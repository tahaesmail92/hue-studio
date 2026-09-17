// The shape every Server Action in the signed-in app returns, and the value
// its form starts from.
//
// It lives beside the actions rather than inside them because a "use server"
// module may only export async functions.
export type FormState = { error?: string; ok?: string } | null;

export const initialState: FormState = null;
