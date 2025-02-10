return {
  'navarasu/onedark.nvim',
  lazy = false,
  priority = 1000,
  config = function()
    require('onedark').setup {
      style = "dark",
      transparent = true,  -- show/hide background
      term_colors = true, -- Change terminal color as per the selected theme style
      lualine = {
        transparent = true, -- lualine center bar transparency
      },
       -- toggle theme style ---
    toggle_style_key = '<leader>ts', -- keybind to toggle theme style. Leave it nil to disable it, or set it to a string, for example "<leader>ts"
    toggle_style_list = {'dark', 'darker', 'cool', 'deep', 'warm', 'warmer', 'light'}, -- List of styles to toggle between
    }
    require('onedark').load()
  end
}
