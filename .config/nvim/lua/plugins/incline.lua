return {
  "b0o/incline.nvim",
  event = "VeryLazy",
  dependencies = { "SmiteshP/nvim-navic" },
  config = function()
    local helpers = require("incline.helpers")
    local navic = require("nvim-navic")
    local devicons = require("nvim-web-devicons")
    require("incline").setup({
      window = {
        padding = 0,
        margin = { horizontal = 0, vertical = 0 },
      },
      render = function(props)
        local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ":t")
        if filename == "" then
          filename = "[No Name]"
        end
        if filename:find("index") or filename:find("style") then
          filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ":h:t") .. "/" .. filename
        end
        local ft_icon, ft_color = devicons.get_icon_color(filename)
        local modified = vim.bo[props.buf].modified
        local os_name = vim.loop.os_uname().sysname
        local prefix = os_name == "Darwin" and "" or " "
        local res = {
          ft_icon and {
            prefix,
            ft_icon,
            " ",
            guibg = ft_color,
            guifg = helpers.contrast_color(ft_color),
          } or "",
          " ",
          { filename, gui = "bold,italic" },
          -- guibg = "#44406e",
        }
        if props.focused then
          for _, item in ipairs(navic.get_data(props.buf) or {}) do
            table.insert(res, {
              { " ›", group = "NavicSeparator" },
              { item.icon, group = "NavicIcons" .. item.type },
              { item.name, group = "NavicIcons" .. item.type },
            })
          end
        end
        table.insert(res, " ")
        return res
      end,
    })
  end,
  event = "VeryLazy",
}
