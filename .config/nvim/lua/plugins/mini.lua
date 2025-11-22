local utils = require("utils")

-- Open LSP picker for the given scope
---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
---@param autojump boolean? If there is only one result it will jump to it.
local function lsp_picker(scope)
  ---@return string
  local function get_symbol_query()
    return vim.fn.input("Symbol: ")
  end

  ---@param opts vim.lsp.LocationOpts.OnList
  local function on_list(opts)
    vim.fn.setqflist({}, " ", opts)

    if #opts.items == 1 then
      vim.cmd.cfirst()
    else
      require("mini.extra").pickers.list({ scope = "quickfix" }, { source = { name = opts.title } })
    end
  end

  if scope == "references" then
    vim.lsp.buf.references(nil, { on_list = on_list })
    return
  end

  if scope == "workspace_symbol" then
    vim.lsp.buf.workspace_symbol(get_symbol_query(), { on_list = on_list })
    return
  end

  vim.lsp.buf[scope]({ on_list = on_list })
end

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

local function fff()
  local mini_pick = require("mini.pick")
  local file_picker = require("fff.file_picker")
  if not file_picker.is_initialized() then
    if not file_picker.setup() then
      vim.notify("Could not setup fff.nvim", vim.log.levels.ERROR)
      return
    end
  end

  ---@param query string|nil
  ---@return PickerItem[]
  local function find(query)
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
local function setup_ai()
  local ai = require("mini.ai")
  ai.setup({
    n_lines = 300,
    custom_textobjects = {
      o = ai.gen_spec.treesitter({ -- code block
        a = { "@block.outer", "@conditional.outer", "@loop.outer" },
        i = { "@block.inner", "@conditional.inner", "@loop.inner" },
      }),
      f = ai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
      c = ai.gen_spec.treesitter({ a = "@class.outer", i = "@class.inner" }), -- class
      t = { "<([%p%w]-)%f[^<%w][^<>]->.-</%1>", "^<.->().*()</[^/]->$" }, -- tags
      -- Whole buffer.
      g = function()
        local from = { line = 1, col = 1 }
        local to = {
          line = vim.fn.line("$"),
          col = math.max(vim.fn.getline("$"):len(), 1),
        }
        return { from = from, to = to }
      end,
    },
    -- Disable error feedback.
    silent = true,
  })
end

local function setup_pairs()
  require("mini.pairs").setup({
    modes = { insert = true, command = true, terminal = false },
    -- skip autopair when next character is one of these
    skip_next = [=[[%w%%%'%[%"%.%`%$]]=],
    -- skip autopair when the cursor is inside these treesitter nodes
    skip_ts = { "string" },
    -- skip autopair when next character is closing pair
    -- and there are more closing pairs than opening pairs
    skip_unbalanced = true,
    -- better deal with markdown code blocks
    markdown = true,
  })
end

local function setup_extra()
  require("mini.extra").setup({})
end

local function setup_pick()
  require("mini.pick").setup({})
  vim.api.nvim_create_autocmd("LspAttach", {
    group = utils.creat_group("lsp-attach"),
    callback = function()
      utils.map("gd", function()
        lsp_picker("definition")
      end, { desc = "Goto Definition" })
      utils.map("gr", function()
        lsp_picker("references")
      end, { desc = "Goto Reference" })
      utils.map("gt", function()
        lsp_picker("type_definition")
      end, { desc = "Goto Type Definition" })
      utils.map("gI", function()
        lsp_picker("implementation")
      end, { desc = "Goto Implementation" })
    end,
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
    "nvim-mini/mini.nvim",
    dependencies = "dmtrKovalenko/fff.nvim",
    version = false,
    config = function()
      setup_ai()
      setup_pairs()
      setup_extra()
      setup_pick()
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
          MiniPick.builtin.grep_live()
        end,
        desc = "Live Grep",
      },
      {
        "<leader>st",
        function()
          MiniExtra.pickers.colorschemes()
        end,
        desc = "Switch Theme",
      },
    },
  },
}
