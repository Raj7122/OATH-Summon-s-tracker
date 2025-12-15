import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchAuthSession, signIn, signOut, getCurrentUser, AuthUser, confirmSignIn, fetchUserAttributes } from 'aws-amplify/auth';

/**
 * Extended user info including display name from Cognito attributes
 */
interface UserInfo {
  userId: string;
  username: string;  // email
  displayName: string;  // name attribute (Jacky, Arthur, Jelly)
}

interface AuthContextType {
  user: AuthUser | null;
  userInfo: UserInfo | null;  // Extended user info with display name
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  isAuthenticated: boolean;
  requiresPasswordChange: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  // Check if user is already authenticated on mount
  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const session = await fetchAuthSession();
      if (session.tokens?.accessToken) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        // Fetch user attributes to get display name
        try {
          const attributes = await fetchUserAttributes();
          setUserInfo({
            userId: currentUser.userId,
            username: currentUser.username,
            displayName: attributes.name || currentUser.username.split('@')[0], // fallback to email prefix
          });
        } catch (attrError) {
          console.log('Could not fetch user attributes:', attrError);
          // Fallback to email prefix as display name
          setUserInfo({
            userId: currentUser.userId,
            username: currentUser.username,
            displayName: currentUser.username.split('@')[0],
          });
        }
      }
    } catch (error) {
      console.log('No authenticated user', error);
      setUser(null);
      setUserInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (username: string, password: string) => {
    try {
      const signInResult = await signIn({ username, password });

      // Check if password change is required
      if (signInResult.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        console.log('Password change required');
        setRequiresPasswordChange(true);
        throw new Error('NEW_PASSWORD_REQUIRED');
      }

      await checkUser();
    } catch (error) {
      console.error('Error signing in:', error);
      if (error instanceof Error && error.message === 'NEW_PASSWORD_REQUIRED') {
        // Don't rethrow, just set the state
        return;
      }
      throw error;
    }
  };

  const handleCompleteNewPassword = async (newPassword: string) => {
    try {
      await confirmSignIn({ challengeResponse: newPassword });
      setRequiresPasswordChange(false);
      await checkUser();
    } catch (error) {
      console.error('Error completing password change:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setUserInfo(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    userInfo,
    loading,
    signIn: handleSignIn,
    signOut: handleSignOut,
    completeNewPassword: handleCompleteNewPassword,
    isAuthenticated: !!user,
    requiresPasswordChange,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};