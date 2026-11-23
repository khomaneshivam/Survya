import { createContext } from 'react';

// Shared context instance for provider and consumer hook. No JSX or HMR side effects.
const AuthContext = createContext(null);
export default AuthContext;
