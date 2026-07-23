export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginUser {
  userId: string;
  email: string;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export interface CurrentUserReader {
  getCurrentUser(signal?: AbortSignal): Promise<CurrentUser>;
}
