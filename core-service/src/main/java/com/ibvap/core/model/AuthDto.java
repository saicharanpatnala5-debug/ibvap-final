package com.ibvap.core.model;

public class AuthDto {
    public static class LoginRequest {
        private String username;
        private String password;

        public LoginRequest() {}
        public LoginRequest(String username, String password) {
            this.username = username;
            this.password = password;
        }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }

    public static class UserProfile {
        private String id;
        private String username;
        private String role; // COMMANDER, OPERATOR, AUDITOR
        private String token;

        public UserProfile() {}
        public UserProfile(String id, String username, String role, String token) {
            this.id = id;
            this.username = username;
            this.role = role;
            this.token = token;
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getToken() { return token; }
        public void setToken(String token) { this.token = token; }
    }
}
