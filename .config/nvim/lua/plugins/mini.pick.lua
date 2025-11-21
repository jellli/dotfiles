---@class FFFItem
---@field name string
---@field path string
---@field relative_path string
---@field size number
---@field modified number
---@field total_frecency_score number
---@field modification_frecency_score number
---@field access_frecency_score number
---@field git_status string

---@class PickerItem
---@field text string
---@field path string
---@field score number

---@param query string|nil
---@return PickerItem[]
local function find(query)
  local file_picker = require("fff.file_picker")

  ---@type FFFItem[]
  local fff_result = file_picker.search_files(query or "", 100, 4, vim.fn.expand("%:."), false)

  local result = {}
  for _, fff_item in ipairs(fff_result) do
    table.insert(result, {
      text = fff_item.relative_path,
      path = fff_item.path,
      score = fff_item.total_frecency_score,
    })
  end
  return result
end

local function fff()
  local file_picker = require("fff.file_picker")
  if not file_picker.is_initialized() then
    if not file_picker.setup() then
      vim.notify("Could not setup fff.nvim", vim.log.levels.ERROR)
      return
    end
  end

  local mini_pick = require("mini.pick")
  mini_pick.start({
    source = {
      name = "FFFiles",
      items = find,
      match = function(_, _, query)
        local items = find(table.concat(query))
        mini_pick.set_picker_items(items, { do_match = false })
      end,
      show = function(buf_id, items, query)
        mini_pick.default_show(buf_id, items, query, { show_icons = true })
      end,
    },
  })
end

return {
  {
    "dmtrKovalenko/fff.nvim",
    build = function()
      require("fff.download").download_or_build_binary()
    end,
    lazy = false,
    config = true,
  },
  {
    "nvim-mini/mini.extra",
    version = false,
    dependencies = "nvim-mini/mini.pick",
    opt = {},
  },
  {
    "nvim-mini/mini.pick",
    dependencies = {
      "dmtrKovalenko/fff.nvim",
      "nvim-mini/mini.icons",
    },
    version = false,
    config = function()
      local mini_pick = require("mini.pick")
      mini_pick.setup({})
      vim.ui.select = mini_pick.ui_select
    end,
    keys = {
      {
        "<leader><leader>",
        fff,
        desc = "Search Files",
      },
      {
        "<leader>sg",
        function()
          require("mini.pick").builtin.grep_live()
        end,
        desc = "Live Grep",
      },
      {
        "<leader>st",
        function()
          require("mini.extra").pickers.colorschemes()
        end,
        desc = "Switch Theme",
      },
    },
  },
}
