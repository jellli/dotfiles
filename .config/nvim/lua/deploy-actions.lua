-- local has_async, async = pcall(require, "async")
-- local has_popup, Popup = pcall(require, "nui.popup")
-- local has_input, Input = pcall(require, "nui.input")
-- local has_layout, Layout = pcall(require, "nui.layout")
--
-- local has_deps = has_async and has_popup and has_input and has_layout
-- if not has_deps then
--   vim.notify("Missing dependencies", vim.log.levels.ERROR, { title = "Deploy" })
--   return
-- end

local async = require("async")
local Popup = require("nui.popup")
local Input = require("nui.input")
local Layout = require("nui.layout")
local utils = require("utils")

local uv = vim.uv
local asystem = async.wrap(3, vim.system)

local M = {}

--- Parse the version from package.json
--- @param path string
--- @return string | nil version
function M.parse_current_version(path)
  local stat = uv.fs_stat(path)
  if stat and stat.type == "file" then
    local lines = vim.fn.readfile(path)
    local json = vim.fn.json_decode(lines)
    return json.version
  else
    vim.notify("No package.json found", vim.log.levels.ERROR, { title = "Deploy" })
    return
  end
end

--- Get the next release branch name
---@param opts { mode: "release" | "hotfix" }
---@return string next release branch name
function M.get_next_release_branch_name(opts)
  local prefix = opts.mode .. "/" .. os.date("%Y%m%d") .. "-"
  local branch_name
  local latest_number = 0
  local stdout = vim
    .system({ "git", "for-each-ref", "--format=%(refname:short)", "refs/heads/" .. prefix .. "*" }, { text = true })
    :wait().stdout
  local lines = vim.split(stdout or "", "\n")
  for _, line in ipairs(lines) do
    local number_str = line:match("-(%d+)")
    if number_str ~= nil then
      local current_number = tonumber(number_str)
      if current_number and current_number > latest_number then
        latest_number = current_number
      end
    end
  end
  branch_name = prefix .. (latest_number + 1)
  return branch_name
end

--- generates a deploy branch name
--- @param opts { mode: "release" | "hotfix", should_fetch: boolean }
---@return  nil
function M.prepare_release(opts)
  local cwd = vim.fn.getcwd()
  local path = cwd .. "/package.json"
  local version = M.parse_current_version(path)
  if not version then
    return
  end
  vim.system({ "git", "switch", "master" })

  if opts.should_fetch then
    async
      .run(function()
        asystem({ "git", "pull" })
        asystem({ "git", "fetch", "--prune" })
      end)
      :wait()
  end

  local branch_name = M.get_next_release_branch_name(opts)
  vim.system({ "git", "switch", "-c", branch_name })
end

function M.show_version_input(current_version, callback)
  local input = Input({
    position = "50%",
    size = { width = 30, height = 1 },
    border = {
      style = "rounded",
      text = { top = "New Version (current version: " .. current_version .. ")", top_align = "center" },
    },
  }, {
    prompt = "> ",
    default_value = current_version,
    on_close = function()
      vim.notify("Version release cancelled", vim.log.levels.WARN)
    end,
    on_submit = function(value)
      if not value or value == "" then
        vim.notify("Version release cancelled", vim.log.levels.WARN)
        return
      end

      if not value:match("^%d+%.%d+%.%d+") then
        vim.notify("Invalid version format. Expected: x.y.z", vim.log.levels.ERROR)
        return
      end

      callback(value)
    end,
  })
  vim.api.nvim_buf_set_lines(input.bufnr, 0, 0, false, {})
  input:mount()

  input:map("n", "q", function()
    input:unmount()
  end, { noremap = true })
end

local function create_nui_layout(package_json_path, changelog_path, new_version)
  -- 计算窗口大小
  local width = math.floor(vim.o.columns * 0.9)
  local height = math.floor(vim.o.lines * 0.85)

  local popup_opts = {
    border = {
      style = "single",
    },
    buf_options = {
      modifiable = true,
      readonly = false,
    },
  }
  local popups = {
    package = Popup({
      text = {
        top = "package.json",
        top_align = "center",
      },
      border = {
        style = "single",
      },
      buf_options = {
        modifiable = true,
        readonly = false,
      },
    }),
    changelog = Popup({
      text = {
        top = "CHANGELOG.md",
        top_align = "center",
      },
      border = {
        style = "single",
      },
      buf_options = {
        modifiable = true,
        readonly = false,
      },
    }),
  }
  local function close_all_popups()
    for _, popup in pairs(popups) do
      popup:unmount()
    end
  end

  for _, popup in pairs(popups) do
    popup:map("n", "q", function()
      close_all_popups()
    end, { noremap = true })
  end

  -- 创建布局
  local layout = Layout(
    {
      position = "50%",
      size = {
        width = width,
        height = height,
      },
    },
    Layout.Box({
      Layout.Box(popups.package, { size = "50%" }),
      Layout.Box(popups.changelog, { size = "50%" }),
    }, { dir = "row" })
  )
  layout:mount()

  local package_lines = vim.fn.readfile(package_json_path)
  vim.api.nvim_buf_set_lines(popups.package.bufnr, 0, -1, false, package_lines)
  vim.api.nvim_buf_set_name(popups.package.bufnr, package_json_path)
  vim.api.nvim_set_option_value("filetype", "json", { buf = popups.package.bufnr })

  local changelog_lines = vim.fn.readfile(changelog_path)
  vim.api.nvim_buf_set_lines(popups.changelog.bufnr, 0, -1, false, changelog_lines)
  vim.api.nvim_buf_set_name(popups.changelog.bufnr, changelog_path)
  vim.api.nvim_set_option_value("filetype", "markdown", { buf = popups.changelog.bufnr })

  vim.api.nvim_set_current_win(popups.changelog.winid)
end

function M.test()
  local cwd = vim.fn.getcwd()
  local path = cwd .. "/package.json"
  local changelog_path = cwd .. "/CHANGELOG.md"
  local version = M.parse_current_version(path)
  M.show_version_input(version, function(new_version)
    create_nui_layout(path, changelog_path, new_version)
  end)
end

return M
