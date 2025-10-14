local merge = require("utils").merge
return {
  "keaising/im-select.nvim",
  event = "VeryLazy",
  opts = function()
    local opt = {
      set_default_events = { "InsertLeave", "CmdlineLeave", "FocusGained" },
      set_previous_events = {},
      keep_quiet_on_no_binary = false,
      async_switch_im = true,
    }
    if vim.fn.executable("macism") then
      return merge(opt, {
        default_im_select = "com.apple.keylayout.ABC",
        default_command = "macism",
      })
    end
    if vim.fn.executable("im-select.exe") then
      return merge(opt, {
        default_im_select = "1033",
        default_command = "im-select.exe",
      })
    end
    return opt
  end,
}
