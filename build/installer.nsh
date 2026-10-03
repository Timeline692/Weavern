!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "欢迎使用织识"
  !define MUI_WELCOMEPAGE_TEXT "将资料、笔记与灵感整理为属于自己的知识库。点击“下一步”开始安装。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "卸载织识"
  !define MUI_WELCOMEPAGE_TEXT "感谢你使用织识。卸载应用不会删除你选择的知识库文件夹。"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
