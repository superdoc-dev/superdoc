const Header = () => {
  return (
    <header className="header" id="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#667eea" strokeWidth="2" strokeLinejoin="round" />
              <path d="M2 17L12 22L22 17" stroke="#667eea" strokeWidth="2" strokeLinejoin="round" />
              <path d="M2 12L12 17L22 12" stroke="#667eea" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1>Student Portal</h1>
            <small>Document Management System</small>
          </div>
        </div>
        <div className="user-info user-switcher" id="userSwitcher">
          <div className="user-avatar" id="userAvatar">AJ</div>
          <div>
            <div id="userName">Sarah Smith</div>
            <small id="userRole">Professor</small>
          </div>
          <div className="user-dropdown" id="userDropdown">
            <div className="user-option active" data-user="student">
              <div className="user-option-name">Alex Johnson</div>
              <div className="user-option-email">alex.johnson@aol.com</div>
              <div className="user-option-role">Student</div>
            </div>
            <div className="user-option" data-user="professor">
              <div className="user-option-name">Sarah Smith</div>
              <div className="user-option-email">sarah.smith@uni.edu</div>
              <div className="user-option-role">Professor</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
