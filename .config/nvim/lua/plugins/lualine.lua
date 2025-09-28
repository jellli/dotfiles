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

local function grapple_tag()
  local icon = "󰛢"
end

return {
  "nvim-lualine/lualine.nvim",
  event = "VeryLazy",
  dependencies = {
    "nvim-tree/nvim-web-devicons",
  },
  config = function()
    require("lualine").setup({
      options = {
        theme = "auto",
        icons_enabled = true,
        globalstatus = true,
        component_separators = "",
        section_separators = "",
      },

      sections = {
        lualine_a = {
          { "mode" },
        },
        lualine_b = { "branch", "diff" },
        lualine_c = {
          {
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
                return { bg = "#2853b8", fg = "#ffffff", gui = "bold,italic" }
              end
              return { fg = "#ffffff", bg = "#b44a48", gui = "bold,italic" }
            end,
          },
          {
            function()
              local symbols = {
                status = {
                  [0] = "󰚩 ", -- Enabled
                  [1] = "󱚧 ", -- Disabled Globally
                  [2] = "󱙻 ", -- Disabled for Buffer
                  [3] = "󱙺 ", -- Disabled for Buffer filetype
                  [4] = "󱙺 ", -- Disabled for Buffer with enabled function
                  [5] = "󱚠 ", -- Disabled for Buffer encoding
                  [6] = "󱚠 ", -- Buffer is special type
                },
                server_status = {
                  [0] = " ✓", -- Connected
                  [1] = " ◌", -- Connecting
                  [2] = " ✖", -- Disconnected
                },
              }

              local status, server_status = require("neocodeium").get_status()
              return symbols.status[status]
            end,
            color = function()
              local status, server_status = require("neocodeium").get_status()
              if server_status == 2 then
                return { fg = "#ffffff", bg = "#b44a48" }
              end
              if status == 0 and server_status == 0 then
                return { fg = "#ffffff", bg = "#53b4a2" }
              end
              return { fg = "#ffffff", bg = "#6b6b6b" }
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
    })
  end,
}
