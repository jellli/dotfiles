local icons = require("icons")
local utils = require("utils")

local diagnostics = {
  "diagnostics",
  sections = {
    "error",
    "warn",
    "info",
    -- "hint",
  },
  symbols = {
    error = icons.diagnostics.ERROR .. " ",
    warn = icons.diagnostics.WARN .. " ",
    info = icons.diagnostics.INFO .. " ",
    -- hint = icons.diagnostics.HINT .. " ",
  },
  colored = true, -- Displays diagnostics status in color if set to true.
  update_in_insert = false, -- Update diagnostics in insert mode.
  always_visible = true, -- Show diagnostics even if there are none.
}

local function list_running_tasks()
  local overseer = require("overseer")
  local STATUS = require("overseer.constants").STATUS
  return overseer.list_tasks({
    unique = true,
    recent_first = true,
    status = STATUS.RUNNING,
  })
end
local function overseer_running_task()
  local tasks = list_running_tasks()
  return #tasks .. " task" .. (#tasks > 1 and "s" or "")
end

return {
  "nvim-lualine/lualine.nvim",
  event = "VeryLazy",
  dependencies = {
    "nvim-tree/nvim-web-devicons",
  },
  opts = {
    options = {
      theme = "auto",
      icons_enabled = true,
      globalstatus = true,
      component_separators = "",
      section_separators = "",
      disabled_filetypes = { statusline = { "snacks_dashboard" } },
    },

    sections = {
      lualine_a = {
        { "mode" },
      },
      lualine_b = { "branch", "diff" },
      lualine_c = {
        {
          "grapple",
          function()
            -- invoke `progress` here.
            return require("lsp-progress").progress()
          end,
          color = {
            fg = utils.get_hl_hex("Comment", "fg"),
            bg = "NONE",
          },
        },
      },
      lualine_x = {},
      lualine_y = {
        {
          overseer_running_task,
          color = function()
            local tasks = list_running_tasks()
            if #tasks > 0 then
              return { fg = "#8d9a7e", bg = "None" }
            end
            return { fg = "#b44a48", bg = "None", gui = "bold" }
          end,
        },
        diagnostics,
        "filetype",
      },
      lualine_z = {},
    },
    extensions = {
      "fzf",
      "lazy",
      "mason",
      "overseer",
      "quickfix",
    },
  },
}
