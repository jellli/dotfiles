--- Create an augroup
--- @param name string
--- @return integer
local function create_augroup(name)
	return vim.api.nvim_create_augroup(name, { clear = true })
end

vim.api.nvim_create_autocmd("FileType", {
	group = create_augroup("CloseWithQ"),
	pattern = { "checkhealth", "grug-far", "help", "lspinfo", "qf", "DiffviewFiles" },
	callback = function(event)
		vim.bo[event.buf].buflisted = false
		vim.schedule(function()
			vim.keymap.set("n", "q", function()
				vim.cmd("close")
				pcall(vim.api.nvim_buf_delete, event.buf, { force = true })
			end, { buffer = event.buf, silent = true, desc = "Quit buffer" })
		end)
	end,
})
